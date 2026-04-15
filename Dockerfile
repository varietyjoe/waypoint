FROM node:20-bookworm-slim
CMD ["node", "-e", "require('http').createServer((q,r)=>r.end('ok')).listen(process.env.PORT||3000,()=>console.log('UP on',process.env.PORT||3000))"]
