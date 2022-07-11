import { Console } from "console";
import { createRequire } from "module";
import WebSocket from "ws";
const require = createRequire(import.meta.url);
require("dotenv").config()
const { Pool, Client } = require('pg');
const {WebSocketServer} = require("ws");
const WebsocketInterval = 58*1000;
const AuthTimeout = 10*1000;
function OnDatabaseConnect(){
    console.log("Connected to Database")
}
async function LoginUser(token){
    const res = await pool.query("Select * from \"Users\" where \"Token\"=$1 and \"CanLogin\"='t'",[token]);
    if(res.rowCount>0)
        return res.rows[0]
    else
        return undefined;
}
async function banuser(user){
    const res=await pool.query("UPDATE public.\"Users\"SET \"CanLogin\"='f' WHERE \"Name\"=$1;",[user]);
}
if(process.env.DATABASE_URL){


    var pool = new Client({
        connectionString:process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
          }
    })
    await pool.connect().then(OnDatabaseConnect);
}
else{
    var pool = new Client()
    await pool.connect().then(OnDatabaseConnect);
}
const wss = new WebSocketServer({
    port:process.env.PORT||8080
},()=>{
    console.log("Websocket listening")
});
wss.on("connection",(ws)=>{
    ws.send(JSON.stringify({e:0,data:{
        interval:WebsocketInterval,
        Authtimeout:AuthTimeout
    }}))
    setTimeout(()=>{
        if(!ws.auth)
            ws.close(1000)
    },AuthTimeout)
    ws.on("message",async (data)=>{
        var message = JSON.parse(data.toString())
        if(message.e===undefined||message.data===undefined){
            ws.close(4002);

        }
        else{ 
            if(message.e=="0" && message.data.token&&!ws.auth){
                const logginedUser=await LoginUser(message.data.token)
                if(logginedUser){
                    ws.auth=logginedUser
                    var clients = []
                    wss.clients.forEach(ws=>{
                        if(ws.auth&&ws.readyState==WebSocket.OPEN){
                            clients.push(ws.auth["Name"]);
                            ws.send(JSON.stringify({
                                e:1,
                                data:{
                                    username:logginedUser["Name"]
                                }
                            }))
                        }
                    });
                    ws.send(JSON.stringify({
                        e:4,
                        data:{
                            user:logginedUser,
                            clients:clients
                        }
                    }))
                }
                else
                    ws.close(4403);
            }
            else if(message.e=="1"&&message.data.username&&ws.auth&&ws.auth.moderator){
                await banuser(message.data.username);
                wss.clients.forEach(ws=>{
                    if(ws.auth["Name"]==message.data.username&&ws.readyState==WebSocket.OPEN)
                        ws.close(4403)
                })
            }
            else if(message.e=="2" && message.data.message&&ws.auth){
                const sender = ws.auth
                    wss.clients.forEach(ws=>{
                        if(ws.auth&&ws.readyState==WebSocket.OPEN){
                            ws.send(JSON.stringify({
                                e:2,
                                data:{
                                    username:sender["Name"],
                                    message:message.data.message
                                }
                            }))
                        }
                    });
            }
            
        }
    })
    ws.on("close",()=>{
        const sender = ws.auth
        if(ws.auth){
            wss.clients.forEach(ws=>{
                if(ws.auth&&ws.readyState==WebSocket.OPEN){
                    ws.send(JSON.stringify({
                        e:3,
                        data:{
                            username:sender["Name"]
                        }
                    }))
                }
            });
        }
    })
})