import assert from 'node:assert/strict';
import {test} from 'node:test';
import {atenderMensaje,HERRAMIENTAS} from '../functions/datos-frunet/protocolo.ts';
test('solo expone cinco herramientas de lectura',()=>{assert.equal(HERRAMIENTAS.length,5);assert(HERRAMIENTAS.every(t=>t.annotations.readOnlyHint&&!t.annotations.destructiveHint));});
test('rechaza escritura, herramientas desconocidas e inyección de filtros',async()=>{
 const query=async()=>{throw new Error('No debe ejecutarse')};
 for(const m of [{method:'execute_sql',params:{sql:'delete'}},{method:'tools/call',params:{name:'borrar'}},{method:'tools/call',params:{name:'resumen_horas',arguments:{sql:'select *'}}}])assert('error' in (await atenderMensaje({jsonrpc:'2.0',id:1,...m},query))!);
});
test('conserva filtros válidos y devuelve datos sin inventarlos',async()=>{
 const m=await atenderMensaje({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'resumen_horas',arguments:{finca:'PAI',desde:'2026-11-03',hasta:'2026-11-07',agrupar:'grupo'}}},async(n,a)=>{assert.equal(n,'resumen_horas');assert.equal(a.finca,'PAI');return {total_horas:100};});
 assert.equal(JSON.parse((m as any).result.content[0].text).total_horas,100);
});
test('los errores de datos no se convierten en cifras',async()=>{const m=await atenderMensaje({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'catalogo'}},async()=>{throw new Error('Perfil inactivo')});assert.equal((m as any).result.isError,true);});
