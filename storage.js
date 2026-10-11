let connection;
function db() {
  return connection ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open('operation-hot-bunny',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('data');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(Error('Browser storage is unavailable. Export a backup before closing.'));
  });
}
export async function load() {
  const database=await db();
  return new Promise((resolve,reject)=>{const r=database.transaction('data').objectStore('data').get('project');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function save(value) {
  const database=await db();
  return new Promise((resolve,reject)=>{const tx=database.transaction('data','readwrite');tx.objectStore('data').put(value,'project');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Could not save to browser storage. Export a backup.'));tx.onabort=()=>reject(Error('Browser storage is full. Export a backup.'));});
}
