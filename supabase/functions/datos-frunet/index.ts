import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { atenderMensaje } from "./protocolo.ts";
const proyecto=Deno.env.get("SUPABASE_URL")!;
const base=proyecto+"/functions/v1/datos-frunet";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,mcp-protocol-version","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const responder=(b:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(b),{status,headers:{...cors,"Content-Type":"application/json",...extra}});
const acceso=()=>responder({error:"Inicia sesión en la app y autoriza la consulta de datos de campo"},401,{"WWW-Authenticate":`Bearer resource_metadata="${base}/oauth-protected-resource"`});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const path=new URL(req.url).pathname.replace(/^.*\/datos-frunet/,"").replace(/\/$/,"")||"/";
 if(req.method==="GET"&&(path==="/oauth-protected-resource"||path==="/.well-known/oauth-protected-resource"))return responder({resource:base,authorization_servers:[proyecto+"/auth/v1"],bearer_methods_supported:["header"],resource_name:"Datos Frunet — consulta de campo"});
 if(path!=="/")return responder({error:"Ruta no encontrada"},404);
 const token=(req.headers.get("Authorization")??"").replace(/^Bearer /i,"").trim();
 if(!token)return acceso();
 // getUser valida el token con Supabase Auth; no se confía en un JWT solo decodificado.
 const db=createClient(proyecto,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return acceso();
 if(req.method!=="POST")return responder({error:"Usa POST para las consultas MCP"},405);
 if(Number(req.headers.get("content-length")??0)>32768)return responder({error:"Solicitud demasiado grande"},413);
 let m:unknown;try{const text=await req.text();if(text.length>32768)return responder({error:"Solicitud demasiado grande"},413);m=JSON.parse(text);}catch{return responder({jsonrpc:"2.0",id:null,error:{code:-32700,message:"JSON no válido"}},400);}
 const result=await atenderMensaje(m,async(nombre,args)=>{
   const r=await db.rpc("consultar_campo_chatgpt",{p_consulta:nombre,p_parametros:args});
   if(r.error)throw new Error(r.error.message);return r.data;
 });
 return result===null?new Response(null,{status:202,headers:cors}):responder(result);
});
