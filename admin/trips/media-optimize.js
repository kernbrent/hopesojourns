(()=>{
 'use strict';
 const MB=1024*1024,PHOTO_LIMIT=6*MB,VIDEO_LIMIT=20*MB;
 const aborted=signal=>{if(signal?.aborted)throw new DOMException('Upload canceled.','AbortError');};
 const named=(blob,file,ext)=>new File([blob],file.name.replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type});
 const isVideo=file=>file.type.startsWith('video/')||/\.(mp4|webm|mov|m4v)$/i.test(file.name);
 const size=bytes=>bytes<MB?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/MB).toFixed(1)} MB`;
 function result(original,file){return {file,originalSize:original.size,saved:Math.max(0,original.size-file.size)};}
 async function photo(file,{signal,onProgress}){
  if(file.size>50*MB)throw Error('Choose an original photo up to 50 MB.');
  aborted(signal);onProgress('Optimizing photo…');
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('This photo could not be opened. Export it as JPEG, PNG, or WebP and try again.');}
  try{
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo optimization is unavailable in this browser.');
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const encode=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
   let blob=await encode('image/webp',.78);aborted(signal);
   if(!blob||blob.type!=='image/webp'){
    // JPEG fallback has an opaque canvas so transparent areas do not turn dark.
    ctx.globalCompositeOperation='destination-over';ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();ctx.fillRect(0,0,canvas.width,canvas.height);
    blob=await encode('image/jpeg',.8);
   }
   if(!blob)throw Error('Could not optimize this photo.');aborted(signal);
   const optimized=named(blob,file,blob.type==='image/webp'?'webp':'jpg');
   const smaller=['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=optimized.size?file:optimized;
   if(smaller.size>PHOTO_LIMIT)throw Error('This photo is still too large. Choose a smaller photo.');
   return result(file,smaller);
  }finally{bitmap.close();}
 }
 async function videoAttempt(file,{signal,onProgress},attempt){
  if(file.size>250*MB)throw Error('Choose an original video up to 250 MB.');
  aborted(signal);onProgress('Reading video…');
  const media=await import('./vendor/mediabunny-1.59.0.js');aborted(signal);
  const input=new media.Input({source:new media.BlobSource(file),formats:media.ALL_FORMATS});
  let conversion,output,canceling,timer;
  const cancel=()=>{if(conversion)canceling=conversion.cancel().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
   const track=await input.getPrimaryVideoTrack();if(!track)throw Error('This file does not contain a video.');
   const duration=await input.computeDuration();aborted(signal);
   if(!Number.isFinite(duration)||duration<=0||duration>300)throw Error('Choose a video up to five minutes long. Trim longer recordings into clips.');
   const bitrate=Math.min(1500000,Math.floor(18*MB*8/duration)-128000);
   const audio=await input.getPrimaryAudioTrack();
   const width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
   const scale=Math.min(1,(bitrate<800000?960:1280)/Math.max(width,height),(bitrate<800000?540:720)/Math.min(width,height));
   const dimensions={width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2)};
   const mp4=attempt===0&&await media.canEncodeVideo('avc',dimensions)&&(!audio||await media.canEncodeAudio('aac'));
   const codec=mp4?'avc':attempt<2&&await media.canEncodeVideo('vp9',dimensions)?'vp9':'vp8';
   if(!await media.canEncodeVideo(codec,dimensions)||audio&&!await media.canEncodeAudio(mp4?'aac':'opus'))throw Error('Video compression is unavailable in this browser. Try current Chrome or Edge, or turn off Optimize uploads for an MP4/WebM file up to 20 MB.');
   const target=new media.BufferTarget();
   output=new media.Output({target,format:mp4?new media.Mp4OutputFormat({fastStart:'in-memory'}):new media.WebMOutputFormat()});
   conversion=await media.Conversion.init({input,output,tags:{},showWarnings:false,
    video:async t=>{
     const w=await t.getDisplayWidth(),h=await t.getDisplayHeight(),s=Math.min(1,(bitrate<800000?960:1280)/Math.max(w,h),(bitrate<800000?540:720)/Math.min(w,h));
     const stats=await t.computePacketStats(100);
     return {codec,width:Math.max(2,Math.floor(w*s/2)*2),height:Math.max(2,Math.floor(h*s/2)*2),fit:'contain',allowTransformationMetadata:false,quality:new media.Quality({bitrate}),frameRate:Math.min(30,stats.averagePacketRate||30),keyFrameInterval:2};
    },audio:{codec:mp4?'aac':'opus',quality:new media.Quality({bitrate:96000}),numberOfChannels:2,sampleRate:48000}});
   if(!conversion.isValid||conversion.discardedTracks.some(d=>d.track.isAudioTrack()||d.track.isVideoTrack()))throw Error('This video cannot be compressed without losing picture or sound. Try an MP4/H.264 version, or turn off Optimize uploads for an MP4/WebM file up to 20 MB.',{cause:conversion.discardedTracks.map(d=>({type:d.track.type,reason:d.reason}))});
   aborted(signal);
   let tooLarge=false,timedOut=false;
   target.on('write',({end})=>{if(end>VIDEO_LIMIT&&!tooLarge){tooLarge=true;cancel();}});
   timer=setTimeout(()=>{timedOut=true;cancel();},10*60*1000);
   conversion.onProgress=p=>onProgress(`Optimizing video: ${Math.min(99,Math.round(p*100))}%`);
   try{await conversion.execute();}catch(error){aborted(signal);if(tooLarge)throw Error('The optimized video is still larger than 20 MB. Trim the video and try again.');if(timedOut)throw Error('Video optimization took too long. Try a shorter clip.');throw error;}
   aborted(signal);
   const blob=new Blob([target.buffer],{type:mp4?'video/mp4':'video/webm'}),optimized=named(blob,file,mp4?'mp4':'webm');
   const smaller=/\.(mp4|webm)$/i.test(file.name)&&file.size<=optimized.size?file:optimized;
   if(smaller.size>VIDEO_LIMIT)throw Error('The optimized video is still larger than 20 MB. Trim the video and try again.');
   return result(file,smaller);
  }finally{
   clearTimeout(timer);signal?.removeEventListener('abort',cancel);
   if(canceling)await canceling;
   if(conversion&&!['done','canceled'].includes(conversion.state))await conversion.cancel().catch(()=>{});
   else if(!conversion&&output)await output.cancel().catch(()=>{});
   input.dispose();
  }
 }
 async function video(file,options){
  for(let attempt=0;attempt<3;attempt++){
   try{return await videoAttempt(file,options,attempt);}
   catch(error){
    aborted(options.signal);
    if(!/encod|flush|compression is unavailable|without losing/i.test(error.message))throw error;
    if(attempt===2)throw Error('This browser could not optimize the video. Try current Chrome or Edge, or turn off Optimize uploads for an MP4/WebM file up to 20 MB.',{cause:error});
    options.onProgress('Trying another video compression format…');
   }
  }
 }
 async function prepare(file,{optimize=true,signal,onProgress=()=>{}}={}){
  aborted(signal);if(!file.size)throw Error('This file is empty.');
  if(optimize)return isVideo(file)?video(file,{signal,onProgress}):photo(file,{signal,onProgress});
  const valid=isVideo(file)?/\.(mp4|webm)$/i.test(file.name)&&file.size<=VIDEO_LIMIT:['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=PHOTO_LIMIT;
  if(!valid)throw Error('Without optimization, choose a JPEG/PNG/WebP photo up to 6 MB or an MP4/WebM video up to 20 MB.');
  return result(file,file);
 }
 window.HSMediaOptimizer={prepare,size};
})();
