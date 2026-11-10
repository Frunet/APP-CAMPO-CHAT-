import { useState } from "react";
import { db } from "../supabase";
import { useCarga } from "../ui";
export function idAutorizacion() {
 return new URLSearchParams(location.search).get("authorization_id") || new URLSearchParams(location.hash.split("?")[1]??"").get("authorization_id") || "";
}
export default function ConexionChatGPT() {
 const id=idAutorizacion(),[ocupado,setOcupado]=useState(false),[mensaje,setMensaje]=useState("");
 const {datos,error,cargando}=useCarga(async()=>{
   if(!id)throw new Error("Abre la conexión desde ChatGPT para iniciar la autorización.");
   const r=await db.auth.oauth.getAuthorizationDetails(id);if(r.error)throw r.error;return r.data;
 },[id]);
 async function resolver(aprobar:boolean){
   setOcupado(true);setMensaje("");
   const r=aprobar?await db.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):await db.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true});
   if(r.error){setMensaje(r.error.message);setOcupado(false);return;}
   if(r.data?.redirect_url)location.assign(r.data.redirect_url);
 }
 const detalle=datos&&"client" in datos?datos:null;
 const destino=detalle?.redirect_uri || (datos&&"redirect_url" in datos?datos.redirect_url:"");
 const destinoSeguro=(()=>{try{const u=new URL(destino);return u.protocol==="https:"&&["chatgpt.com","chat.openai.com","platform.openai.com"].includes(u.hostname);}catch{return false;}})();
 return <section className="card mx-auto max-w-xl space-y-4"><h1 className="text-xl font-bold">Conectar Datos Frunet con ChatGPT</h1>
 <p>Esta conexión permite consultar horas, extras, personal y calendario de las fincas autorizadas para tu usuario, además de costes de mano de obra si tu perfil ya puede verlos en la app. No permite modificar datos ni consultar tarifas, facturas o secretos.</p>
 {cargando&&<p>Cargando solicitud…</p>}{(error||mensaje)&&<p role="alert" className="text-red-700">{error||mensaje}</p>}
 {detalle&&<><p>Aplicación solicitante: <b>{detalle.client.name}</b></p><p className="break-all text-xs text-stone-500">Identificador: {detalle.client.id}<br/>Destino de la respuesta: {detalle.redirect_uri}<br/>Permisos de identidad solicitados: {detalle.scope||"ninguno"}</p><p className="text-sm">Autoriza solo si has iniciado esta conexión desde ChatGPT.</p>{!destinoSeguro&&<p role="alert" className="text-red-700">El destino no pertenece a ChatGPT. Esta conexión no se puede autorizar.</p>}<div className="flex gap-3"><button className="btn" disabled={ocupado||!destinoSeguro} onClick={()=>resolver(true)}>Autorizar solo consulta</button><button className="btn-ghost" disabled={ocupado} onClick={()=>resolver(false)}>Cancelar</button></div></>}
 {datos&&"redirect_url" in datos&&destinoSeguro&&<><p>La solicitud ya está resuelta.</p><a className="btn inline-block" href={datos.redirect_url}>Continuar a ChatGPT</a></>}
 </section>;
}
