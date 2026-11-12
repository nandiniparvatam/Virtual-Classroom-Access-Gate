const API="https://virtual-classroom-backend-mn0h.onrender.com/api",$=id=>document.getElementById(id);
const SUBNET="10.20.30.";
async function call(p,o={}){const r=await fetch(API+p,{headers:{"Content-Type":"application/json"},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"API request failed");return d}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Simulated subnet: each card gets a stable virtual IP inside 10.20.30.0/24
const ipFor=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return SUBNET+(10+h%240)};
let known=new Set(),led;
function setLed(state){const l=$("led");l.className="led "+(state==="g"?"on-g":state==="r"?"on-r":"");clearTimeout(led);if(state)led=setTimeout(()=>l.className="led",2500)}
function renderMembers(logs){const last=new Map();[...logs].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).forEach(x=>{if(x.result==="Granted")last.set(x.cardId,x)});const list=[...last.values()].reverse();
 $("members").innerHTML=list.map(x=>`<div class="chip${known.size&&!known.has(x.cardId)?" new":""}">${esc(x.studentName)}<small>${ipFor(x.cardId)}</small></div>`).join("")||'<span class="empty">No one has entered yet. Scan a registered card.</span>';known=new Set(list.map(x=>x.cardId))}
async function refresh(){try{const [stats,students,logs]=await Promise.all([call("/stats"),call("/students"),call("/logs?limit=50")]);
 $("apiStatus").textContent="Backend connected";$("apiStatus").className="pill ok";
 $("studentCount").textContent=stats.registeredStudents;$("scanCount").textContent=stats.totalScans;$("grantedCount").textContent=stats.granted;$("deniedCount").textContent=stats.denied;
 $("studentTable").innerHTML=students.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.roll)}</td><td class="mono">${esc(s.cardId)}</td><td><button class="delete" data-card="${esc(s.cardId)}">Delete</button></td></tr>`).join("")||'<tr><td colspan="4">No students registered yet.</td></tr>';
 $("logTable").innerHTML=logs.map(x=>`<tr><td>${esc(new Date(x.timestamp).toLocaleString())}</td><td class="mono">${esc(x.cardId)}</td><td>${esc(x.studentName)}</td><td>${esc(x.deviceId)}</td><td class="${x.result==="Granted"?"Granted":"Denied"}">${esc(x.result)}</td></tr>`).join("")||'<tr><td colspan="5">No scans yet.</td></tr>';
 renderMembers(logs)}catch(e){$("apiStatus").textContent="Backend offline";$("apiStatus").className="pill bad";$("studentTable").innerHTML=`<tr><td colspan="4">${esc(e.message)}. Start the backend with npm start.</td></tr>`}}
$("registerForm").onsubmit=async e=>{e.preventDefault();try{await call("/students",{method:"POST",body:JSON.stringify({name:$("newName").value,roll:$("newRoll").value,cardId:$("newCard").value})});$("registerForm").reset();$("registerMessage").textContent="Student registered.";refresh()}catch(x){$("registerMessage").textContent=x.message}};
$("studentTable").onclick=async e=>{const id=e.target.dataset.card;if(id&&confirm("Delete RFID card "+id+"?")){try{await call("/students/"+encodeURIComponent(id),{method:"DELETE"});refresh()}catch(x){alert(x.message)}}};
$("scanForm").onsubmit=async e=>{e.preventDefault();const id=$("scanID").value.trim();try{const r=await call("/scan",{method:"POST",body:JSON.stringify({cardId:id,deviceId:"dashboard-test"})});
 $("scanResult").textContent=r.allowed?"Access granted: joined subnet":"Access denied: blocked from subnet";$("scanResult").className="result "+(r.allowed?"granted":"denied");setLed(r.allowed?"g":"r");
 $("showName").textContent=r.student?.name||"Unknown student";$("showRoll").textContent=r.student?.roll||"Not registered";$("showID").textContent=id;$("showIP").textContent=r.allowed?ipFor(id):"Not assigned";refresh()}catch(x){$("scanResult").textContent=x.message;$("scanResult").className="result denied";setLed("r")}};
$("refreshBtn").onclick=refresh;refresh();setInterval(refresh,15000);
