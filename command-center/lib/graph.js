/* Microsoft Graph To Do via OAuth authorization code + PKCE, ausschließlich im Browser.
 * Keine Geheimnisse in Quellcode, kein Backend und kein Zugriff ohne aktive Anmeldung.
 * Voraussetzung: eigene Entra-SPA-App-Registrierung + Berechtigung Tasks.ReadWrite.
 */
(function(root){
 'use strict';
 const CONFIG='cc_graph_config_v1',AUTH='cc_graph_auth_v1',PKCE='cc_graph_pkce_v1';
 const read=(k,store=localStorage)=>{try{return JSON.parse(store.getItem(k)||'null')}catch{return null}};
 const write=(k,v,store=localStorage)=>store.setItem(k,JSON.stringify(v));
 const bytes=(n)=>{let a=new Uint8Array(n);crypto.getRandomValues(a);return a};
 const b64=(data)=>btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
 const validate=(cfg)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cfg.clientId||''))throw Error('Die Client-ID muss eine gültige UUID sein.');if(!/^([0-9a-f-]{36}|organizations|common|consumers)$/i.test(cfg.tenant||''))throw Error('Ungültige Tenant-ID (GUID oder organizations).');};
 function cfg(){return read(CONFIG)||{clientId:'',tenant:'organizations',listId:''}}
 function save(cfgData){validate(cfgData);write(CONFIG,{clientId:cfgData.clientId.trim(),tenant:cfgData.tenant.trim(),listId:cfgData.listId||''})}
 function redirect(){return location.origin+location.pathname}
 async function login(){const c=cfg();validate(c);if(!window.isSecureContext)throw Error('Microsoft-Anmeldung benötigt HTTPS oder localhost.');const verifier=b64(bytes(32));const hashed=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));const state=b64(bytes(24));write(PKCE,{verifier,state,at:Date.now()},sessionStorage);const p=new URLSearchParams({client_id:c.clientId,response_type:'code',redirect_uri:redirect(),response_mode:'query',scope:'Tasks.ReadWrite User.Read',state,code_challenge:b64(hashed),code_challenge_method:'S256'});location.assign(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/authorize?${p}`)}
 async function callback(){let u=new URL(location.href);if(!u.searchParams.has('code')&&!u.searchParams.has('error'))return false;const error=u.searchParams.get('error');const code=u.searchParams.get('code');const state=u.searchParams.get('state');u.searchParams.delete('code');u.searchParams.delete('state');u.searchParams.delete('session_state');u.searchParams.delete('error');u.searchParams.delete('error_description');history.replaceState({},'',u.pathname+u.search+u.hash);const p=read(PKCE,sessionStorage);sessionStorage.removeItem(PKCE);if(error)throw Error('Microsoft-Anmeldung verweigert: '+error);if(!p||p.state!==state||Date.now()-p.at>600000)throw Error('Sicherheitsprüfung der Microsoft-Anmeldung fehlgeschlagen.');const c=cfg(),payload=new URLSearchParams({client_id:c.clientId,grant_type:'authorization_code',code,redirect_uri:redirect(),code_verifier:p.verifier,scope:'Tasks.ReadWrite User.Read'});const res=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload});const data=await res.json();if(!res.ok||!data.access_token)throw Error('Microsoft-Token konnte nicht bezogen werden: '+(data.error_description||data.error||res.status));write(AUTH,{token:data.access_token,expires:Date.now()+Math.max(0,(Number(data.expires_in)||3600)-90)*1000},sessionStorage);return true}
 function connected(){let a=read(AUTH,sessionStorage);return !!(a&&a.token&&a.expires>Date.now())}
 function logout(){sessionStorage.removeItem(AUTH)}
 async function req(path,method='GET',body){let a=read(AUTH,sessionStorage);if(!a||a.expires<Date.now())throw Error('Microsoft-Sitzung abgelaufen. Bitte erneut anmelden.');let res=await fetch('https://graph.microsoft.com/v1.0'+path,{method,headers:{Authorization:'Bearer '+a.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(res.status===204)return null;let data=await res.json().catch(()=>({}));if(!res.ok){if(res.status===401)logout();throw Error(data.error?.message||`Microsoft Graph HTTP ${res.status}`)}return data}
 async function allPages(path,limit=250){let arr=[],next=path,n=0;while(next&&n++<8){const u=next.startsWith('https://graph.microsoft.com/v1.0')?next.substring('https://graph.microsoft.com/v1.0'.length):next;if(!u.startsWith('/me/todo/'))throw Error('Unerwarteter Microsoft-Graph-Seitenlink.');const d=await req(u);arr.push(...(d.value||[]));next=d['@odata.nextLink'];if(arr.length>=limit)break}return arr.slice(0,limit)}
 const lists=()=>allPages('/me/todo/lists');
 const tasks=(id)=>allPages(`/me/todo/lists/${encodeURIComponent(id)}/tasks`);
 const add=(id,title)=>req(`/me/todo/lists/${encodeURIComponent(id)}/tasks`,'POST',{title,status:'notStarted'});
 const update=(id,taskId,patch)=>req(`/me/todo/lists/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`,'PATCH',patch);
 const remove=(id,taskId)=>req(`/me/todo/lists/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`,'DELETE');
 root.GraphToDo={cfg,save,login,callback,connected,logout,lists,tasks,add,update,remove,redirect};
})(window);
