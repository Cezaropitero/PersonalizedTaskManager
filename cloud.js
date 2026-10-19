(async function(){
const box=document.createElement('section');
box.className='card';box.id='settingsSection';box.hidden=true;box.style.marginTop='18px';
box.innerHTML='<h2>Konto i synchronizacja</h2><section class="cloud-group"><h3>Konto</h3><p id="cloudAccount" class="cloud-account"></p><form id="cloudAuth" class="cloud-actions"><input class="text-input" style="max-width:270px" type="email" id="cloudEmail" placeholder="E-mail" autocomplete="username" aria-label="E-mail" required><input class="text-input" style="max-width:270px" type="password" id="cloudPassword" placeholder="Hasło (minimum 8 znaków)" autocomplete="current-password" aria-label="Hasło" minlength="8" required><button class="primary">Zaloguj</button><button class="secondary" type="button" id="cloudRegister">Utwórz konto</button></form><button class="secondary" id="cloudLogout" hidden>Wyloguj</button></section><section class="cloud-group"><h3>Synchronizacja</h3><p id="cloudStatus" role="status">Łączenie…</p><div class="cloud-actions"><button class="secondary" id="cloudRetry">Odśwież / ponów zapis</button><button class="secondary" id="cloudImport" hidden>Przenieś dane lokalne na konto</button></div><p class="small-note">Przeniesienie danych lokalnych zastępuje obecne dane na koncie.</p></section><section class="cloud-group"><h3>Kopie zapasowe</h3><p class="small-note">Pobierz zadania, cele i zasady jako plik JSON.</p><button class="secondary" id="cloudExport">Pobierz kopię danych</button></section>';
document.querySelector('main').append(box);
const badge=document.createElement('button');badge.type='button';badge.className='cloud-summary';badge.id='cloudSummary';badge.setAttribute('aria-label','Status synchronizacji — otwórz ustawienia');badge.textContent='☁ Łączenie…';badge.onclick=()=>switchView('settings');document.querySelector('.date-pill').after(badge);
const baseSwitch=switchView;
switchView=function(view){baseSwitch(view);box.hidden=!!user&&view!=='settings'};
const status=m=>{
 $('cloudStatus').textContent=m;badge.title=m;
 const saved=/^(Zapisano w chmurze|Zsynchronizowano)/.test(m);
 const pending=/^(Oczekuje|Łączenie|Logowanie)/.test(m);
 const localMode=m.startsWith('Tryb lokalny');
 const message=/^(Sprawdź pocztę)/.test(m);
 badge.dataset.state=saved?'saved':pending||localMode||message?'pending':'error';
 badge.textContent=saved?'☁ Zapisano':pending?'☁ Zapisywanie / łączenie…':localMode?'☁ Tryb lokalny':message?'✉ Potwierdź konto':'⚠ Sprawdź ustawienia';
};

const appNodes=[...document.querySelector('main').children].filter(n=>n!==box);
const lock=b=>{appNodes.forEach(n=>n.inert=b);document.querySelector('.sidebar').inert=b};
let client,user=null,ready=false,dirty=false,busy=false,revision=0,timer,conflict=false;
const local={tasks:JSON.parse(JSON.stringify(tasks)),goals:JSON.parse(JSON.stringify(goals)),rules:$('rulesText').value};
const snapshot=()=>({tasks,goals,rules:$('rulesText').value});
function apply(p){
 if(!p||!Array.isArray(p.tasks)||!Array.isArray(p.goals)||typeof p.rules!=='string')throw Error('Nieprawidłowy format danych');
 tasks=p.tasks;goals=p.goals;$('rulesText').value=p.rules;selectedGoalId=null;$('goalDetail').style.display='none';
 const view=window.plannerView||'ranking';resetForm();refreshGoalOptions();render();renderGoals();switchView(view);
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
 box.hidden=!!user&&window.plannerView!=='settings';$('cloudAccount').textContent=user?user.email:'Zaloguj się, aby korzystać z tych samych danych na telefonie i komputerze.';
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
$('cloudRetry').onclick=()=>{if(conflict){if(!confirm('Pobrać kopię Twoich zmian i wczytać aktualną wersję z chmury?'))return;$('cloudExport').click();conflict=false;dirty=false;ready=false;lock(true);pull();return}dirty?push():pull()};
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