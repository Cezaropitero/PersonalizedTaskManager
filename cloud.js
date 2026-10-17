(async function(){
const box=document.createElement('section');
box.className='card';box.style.marginBottom='18px';
box.innerHTML='<h2>Konto i synchronizacja</h2><form id="cloudAuth" style="display:flex;gap:8px;flex-wrap:wrap"><input class="text-input" style="max-width:270px" type="email" id="cloudEmail" placeholder="E-mail" autocomplete="username" required><input class="text-input" style="max-width:270px" type="password" id="cloudPassword" placeholder="Hasło (minimum 8 znaków)" autocomplete="current-password" minlength="8" required><button class="primary">Zaloguj</button><button class="secondary" type="button" id="cloudRegister">Utwórz konto</button></form><p id="cloudStatus" role="status">Łączenie…</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" id="cloudRetry">Odśwież / ponów zapis</button><button class="secondary" id="cloudImport">Przenieś dane lokalne na konto</button><button class="secondary" id="cloudExport">Pobierz kopię danych</button><button class="secondary" id="cloudLogout">Wyloguj</button></div>';
document.querySelector('main').prepend(box);
const status=m=>$('cloudStatus').textContent=m;
const appNodes=[...document.querySelector('main').children].filter(n=>n!==box);
const lock=b=>{appNodes.forEach(n=>n.inert=b);document.querySelector('.sidebar').inert=b};
let client,user=null,ready=false,dirty=false,busy=false,revision=0,timer,conflict=false;
const local={tasks:JSON.parse(JSON.stringify(tasks)),goals:JSON.parse(JSON.stringify(goals)),rules:$('rulesText').value};
const snapshot=()=>({tasks,goals,rules:$('rulesText').value});
function apply(p){
 if(!p||!Array.isArray(p.tasks)||!Array.isArray(p.goals)||typeof p.rules!=='string')throw Error('Nieprawidłowy format danych');
 tasks=p.tasks;goals=p.goals;$('rulesText').value=p.rules;selectedGoalId=null;$('goalDetail').style.display='none';
 resetForm();refreshGoalOptions();render();renderGoals();switchView('ranking');
}
function cache(){if(user)localStorage.setItem('wazne-cloud-'+user.id,JSON.stringify({payload:snapshot(),revision,dirty}));}
function changed(){if(!ready)return;dirty=true;cache();status(user?'Oczekuje na zapis…':'Tryb lokalny — zaloguj się, aby synchronizować.');clearTimeout(timer);timer=setTimeout(push,600);}
const oldSave=save,oldGoals=saveGoals;
save=function(){if(!user){oldSave();return}normalizeCompletion();normalizeActive();changed()};
saveGoals=function(){if(!user){oldGoals();return}changed()};
const ruleButton=$('saveRules'),newButton=ruleButton.cloneNode(true);ruleButton.replaceWith(newButton);
newButton.onclick=()=>{if(!user)localStorage.setItem(RULES_KEY,$('rulesText').value);else changed();toast('Zapisano zasady.')};
async function pull(){
 if(!user||busy||dirty)return;busy=true;
 try{const {data,error}=await client.from('planner_state').select('payload,revision').eq('user_id',user.id).maybeSingle();if(error)throw error;
 if(data){if(!ready||data.revision!==revision){apply(data.payload);revision=data.revision}}
 else if(!ready){apply({tasks:[],goals:[],rules:''});revision=0}
 ready=true;lock(false);cache();status('Zsynchronizowano · '+user.email);
 }catch(e){status('Nie udało się pobrać danych. Sprawdź SQL i połączenie. '+e.message)}finally{busy=false}
}
async function push(){
 if(!user||!ready||!dirty||busy||conflict)return;busy=true;
 const payload=JSON.parse(JSON.stringify(snapshot()));dirty=false;
 try{const {data,error}=await client.rpc('save_planner',{p_payload:payload,p_revision:revision});if(error)throw error;revision=data;cache();status('Zapisano w chmurze · '+user.email)}
 catch(e){dirty=true;if(e.message.includes('CONFLICT')){conflict=true;status('Konflikt: inne urządzenie zmieniło dane. Pobierz kopię swoich zmian, potem przeładuj stronę, aby pobrać wersję z chmury.')}else status('Brak zapisu w chmurze. Zmiany zachowano na tym urządzeniu. Kliknij ponów. '+e.message);cache()}
 finally{busy=false;if(dirty&&!conflict&&navigator.onLine)clearTimeout(timer)}
}
async function activate(session){
 user=session?.user||null;ready=false;revision=0;conflict=false;
 $('cloudAuth').hidden=!!user;$('cloudLogout').hidden=!user;$('cloudImport').hidden=!user;
 if(!user){dirty=false;apply(local);lock(false);status('Tryb lokalny — zaloguj się, aby synchronizować.');return}
 lock(true);
 try{const cached=JSON.parse(localStorage.getItem('wazne-cloud-'+user.id)||'null');
 if(cached?.dirty){apply(cached.payload);revision=cached.revision;dirty=true;ready=true;lock(false);await push();return}
 }catch(e){status(e.message)}
 dirty=false;await pull();
}
$('cloudAuth').onsubmit=async e=>{e.preventDefault();status('Logowanie…');const {data,error}=await client.auth.signInWithPassword({email:$('cloudEmail').value,password:$('cloudPassword').value});$('cloudPassword').value='';if(error)status(error.message);else await activate(data.session)};
$('cloudRegister').onclick=async()=>{if(!$('cloudAuth').reportValidity())return;const {data,error}=await client.auth.signUp({email:$('cloudEmail').value,password:$('cloudPassword').value,options:{emailRedirectTo:location.origin+location.pathname}});$('cloudPassword').value='';if(error)status(error.message);else if(data.session)await activate(data.session);else status('Sprawdź pocztę i potwierdź konto, następnie zaloguj się.')};
$('cloudLogout').onclick=async()=>{await push();if(dirty){status('Najpierw zapisz zmiany lub pobierz kopię.');return}const {error}=await client.auth.signOut();if(error)status(error.message);else await activate(null)};
$('cloudRetry').onclick=()=>{if(conflict)return status('Pobierz kopię i przeładuj stronę, aby rozwiązać konflikt.');dirty?push():pull()};
$('cloudImport').onclick=()=>{if(!ready||!user)return;if(!confirm('Zastąpić dane konta danymi lokalnymi z tej przeglądarki?'))return;apply(JSON.parse(JSON.stringify(local)));changed()};
$('cloudExport').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}));a.download='wazne-kopia.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
addEventListener('online',()=>dirty?push():pull());
setInterval(()=>{if(!document.hidden&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('editId').value&&$('formSection').style.display==='none'){if(dirty)push();else pull()}},15000);
try{
 if(!window.supabase)throw Error('Nie załadowano biblioteki. Odśwież stronę.');
 client=window.supabase.createClient('https://lcjbdvrutasbecqbooig.supabase.co','sb_publishable_S5JzDm8Mx7BOVOayGKhmpA_VV4hDRSY');
 const {data,error}=await client.auth.getSession();if(error)throw error;await activate(data.session);
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'&&user)setTimeout(()=>activate(null),0)});
}catch(e){status(e.message);lock(false)}
})();