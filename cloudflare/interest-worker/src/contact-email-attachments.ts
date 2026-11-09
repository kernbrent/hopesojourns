import {AdminError,readAdminJson,type AdminEnv} from './admin';
import {Buffer} from 'node:buffer';
export const attachmentLimit=10*1024*1024;
export type EmailAttachment={filename:string;size:number;sha256:string;key:string};
const types:Record<string,string>={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv',rtf:'application/rtf',odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',odp:'application/vnd.oasis.opendocument.presentation',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
export async function attachmentDigest(bytes:Uint8Array){return Buffer.from(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)).toString('hex');}
export async function readEmailBody(request:Request){
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return {body:await readAdminJson(request,128*1024),files:[] as {metadata:EmailAttachment;bytes:Uint8Array}[]};
 const limit=attachmentLimit+128*1024;
 if(Number(request.headers.get('content-length')||0)>limit)throw new AdminError(413,'ATTACHMENT_LIMIT','Attachments must total 10 MB or less.');
 const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();
 if(!reader)throw new AdminError(400,'INVALID_EMAIL','The email could not be read.');
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new AdminError(413,'ATTACHMENT_LIMIT','Attachments must total 10 MB or less.');}chunks.push(part.value);}}finally{reader.releaseLock();}
 let form:FormData,body:Record<string,unknown>;
 try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();body=JSON.parse(String(form.get('email')));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{throw new AdminError(400,'INVALID_EMAIL','The email and attachments could not be read.');}
 const incoming=form.getAll('files');if(incoming.length>5)throw new AdminError(422,'ATTACHMENT_LIMIT','Choose up to 5 attachments.');
 const files=[];let total=0;
 for(const file of incoming){
  if(typeof file==='string')throw new AdminError(422,'INVALID_ATTACHMENT','Choose a file to attach.');
  const ext=file.name.split('.').pop()?.toLowerCase()||'';
  if(!types[ext]||file.name.length>180||/[\\/\u0000-\u001f\u007f]/.test(file.name)||!file.name.trim())throw new AdminError(422,'ATTACHMENT_TYPE','Use PDF, Word, Excel, PowerPoint, OpenDocument, text, CSV, RTF, or common image files.');
  total+=file.size;if(!file.size||file.size>5*1024*1024||total>attachmentLimit)throw new AdminError(422,'ATTACHMENT_LIMIT','Each attachment must be nonempty and no larger than 5 MB; total attachments must not exceed 10 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),prefix=Buffer.from(bytes.slice(0,16));
  const valid=ext==='pdf'?prefix.toString().startsWith('%PDF-'):['docx','xlsx','pptx','odt','ods','odp'].includes(ext)?prefix[0]===80&&prefix[1]===75:['doc','xls','ppt'].includes(ext)?prefix.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1':ext==='png'?prefix.subarray(0,8).toString('hex')==='89504e470d0a1a0a':['jpg','jpeg'].includes(ext)?prefix[0]===255&&prefix[1]===216:ext==='webp'?prefix.toString().startsWith('RIFF')&&prefix.toString().slice(8,12)==='WEBP':ext==='rtf'?prefix.toString().startsWith('{\\rtf'):!bytes.includes(0);
  if(!valid)throw new AdminError(422,'ATTACHMENT_TYPE','An attachment does not match its file type. Choose the original document.');
  const sha256=await attachmentDigest(bytes);files.push({metadata:{filename:file.name,size:file.size,sha256,key:'contact-email-attachments/'+sha256},bytes});
 }
 return {body,files};
}
export function attachmentType(name:string){return types[name.split('.').pop()?.toLowerCase()||'']||'application/octet-stream';}
export async function attachmentBytes(env:AdminEnv,item:EmailAttachment){
 const object=await env.RECEIPTS.get(item.key);
 if(!object||object.size!==item.size)throw new AdminError(503,'ATTACHMENT_UNAVAILABLE','A saved attachment is unavailable. Ask an administrator to check it before retrying.');
 const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
 if(await attachmentDigest(bytes)!==item.sha256)throw new AdminError(503,'ATTACHMENT_UNAVAILABLE','A saved attachment could not be verified. Ask an administrator to check it.');
 return bytes;
}
