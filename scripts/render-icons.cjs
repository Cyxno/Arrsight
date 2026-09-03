/* Reproducible developer utility: npm install --no-save sharp, then node scripts/render-icons.cjs. */
const sharp=require('sharp'); const path=require('path'); const root=path.join(__dirname,'..','public');
Promise.all([[180,'apple-touch-icon.png'],[256,'arrsight-icon-256.png'],[512,'arrsight-icon-512.png']].map(([size,name])=>sharp(path.join(root,'favicon.svg')).resize(size,size).png().toFile(path.join(root,name)))).catch(error=>{console.error(error);process.exitCode=1;});
