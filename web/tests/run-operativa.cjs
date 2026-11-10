const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const out=path.join(os.tmpdir(),'codex-app-campo-operativa-tests.cjs');
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'operativa.test.ts')],bundle:true,platform:'node',format:'cjs',outfile:out});
require('node:child_process').execFileSync(process.execPath,['--test',out],{stdio:'inherit'});
fs.unlinkSync(out);
