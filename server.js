const fs = require('fs')
const _ = require('lodash')
const http = require('http')
const https = require('https')
const morgan = require('morgan')
const express = require('express')
const Discord = require("discord.js")
const client = new Discord.Client()
const { Interval, IntervalComposite } = require('intervals-composite')
const intervals = new IntervalComposite('intervals')
const config = JSON.parse(fs.readFileSync("./config.json"))
const db = JSON.parse(fs.readFileSync("./db.json"))

var c = false

const init = () => {
    intervals.add(new Interval({
        label: "monitor",
        cb: () => {monitor()},
        ms: 5000 // 5 seconds
    }))
    intervals.get("monitor").start()
    monitor(true)
}

const monitor = (start) => {
    if(c || start){
        client.channels.fetch(config.channel).then((channel)=>{
            new Promise(resolve=>{
                if(config.message && config.message != ""){
                    channel.messages.fetch(config.message).then((message)=>{
                        resolve(message)
                    })
                    .catch(e=>{
                        resolve(null)
                    })
                }
                else{
                    resolve(null)
                }
            }).then((m)=>{
                let users = db.participants
                if(users.length>0){
                    new Promise(resolve=>{
                        if(config.ended){
                            config.ended = false
                            m.delete().then(()=>{
                                resolve(null)
                            })
                            .catch(e=>{
                                console.log(e)
                                resolve(null)
                            })
                        }
                        else{
                            resolve(m)
                        }
                    })
                    .then((message)=>{
                        const embed = new Discord.MessageEmbed()
                        embed.setTitle("Currently Chatting")
                        embed.setColor("BLUE")
                        users = users.map(p=>p.name).join("\n") + "\n\nJoin them at https://indyhall.org/zoom"
                        embed.setDescription(users)
                        //
                        if(!message){
                            channel.send("", embed).then((m)=>{
                                config.message = m.id
                                fs.writeFile('./config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {}))
                            })
                            .catch(e=>{
                                console.log(e)
                            })
                        }
                        else{
                            message.edit("", embed).then(()=>{})
                            .catch(e=>{
                                console.log(e)
                            })
                        }
                    })
                }
                else{
                    if(m){
                        m.edit("Nobody is currently chatting, you can start a new chat by going to https://indyhall.org/zoom.").then(()=>{
                            config.ended = true
                        })
                        .catch(e=>{
                            console.log(e)
                        })
                    }
                    else{
                        channel.send("Nobody is currently chatting, you can start a new chat by going to https://indyhall.org/zoom.").then((m)=>{
                            config.ended = true
                            config.message = m.id
                            fs.writeFile('./config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {}))
                        })
                        .catch(e=>{
                            console.log(e)
                        })
                    }
                }
            })
        })
        //
        c = false
    }
}

const app = express()
const ca = fs.readFileSync('/etc/letsencrypt/live/zoomhooks.indyhall.org/chain.pem', 'utf8')
const key = fs.readFileSync('/etc/letsencrypt/live/zoomhooks.indyhall.org/privkey.pem', 'utf8')
const cert = fs.readFileSync('/etc/letsencrypt/live/zoomhooks.indyhall.org/cert.pem', 'utf8')

const httpsServer = https.createServer({
    ca: ca,
    key: key,
    cert: cert
}, app)

httpsServer.listen(443, ()=>console.log("Ready"))
http.createServer(app).listen(80)

app.use(morgan('dev'))
app.use(express.json({limit: '50mb'}))
app.disable('x-powered-by')

const https_redirect = (req, res, next) => {
    if (req.secure){
        return next()
    }
    else{
        return res.redirect('https://' + req.hostname + req.url)
    }
}

app.use(https_redirect)

app.post('/hook', (req, res) => {
    const data = req.body
    if(data.event){
        const object = data.payload.object
        if(config.meetings.includes(object.id)){
            if(data.event == "meeting.participant_joined"){
                const name = object.participant.user_name
                const id = object.participant.user_id
                db.participants.push({name: name, id: id})
                fs.writeFile('./db.json', JSON.stringify(db, null, 4), "utf-8", ((err) => {}))
                c = true
            }
            else if(data.event == "meeting.participant_left"){
                const username = object.participant.user_name
                const id = object.participant.user_id
                const index = _.findIndex(db.participants, p => p.id == id)
                if(index != -1){
                    db.participants.splice(index, 1)
                    fs.writeFile('./db.json', JSON.stringify(db, null, 4), "utf-8", ((err) => {}))
                    c = true
                }
            }
        }
    }
    res.send('Ok')
    console.log(req.body)
})
app.get('*', (req, res) => {
    res.status(404).send({error: 'Not Found'})
})
app.post('*', (req, res) => {
    res.status(403).send({error: 'Method Not Allowed'})
})
app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).send({error: 'Internal server error'})
})

//

client.on("message", (message) => {
    try{
        if (!message.author.bot && message.member) {
            if(message.member.hasPermission("ADMINISTRATOR")){
                const command = message.content.split(/ +/g)[0]
                const msg = message.content.slice(command.length).trim()
                let args = msg.split(" ")
                if (message.content.startsWith(config.prefix+"addmeeting")) {
                    let id = args[0]
                    if(id && id != ""){
                        if(config.meetings.indexOf(id) == -1){
                            config.meetings.push(id)
                            fs.writeFile('./config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {}))
                            message.channel.send(":white_check_mark: | Added successfully.")
                        }
                        else{
                            message.channel.send(":no_entry_sign: | That meeting id is already in the list.")
                        }
                    }
                    else{
                        message.channel.send(":no_entry_sign: | Specify a valid meeting id.")
                    }
                }
                else if (message.content.startsWith(config.prefix+"removemeeting")) {
                    let id = args[0]
                    if(id && id != ""){
                        const index = config.meetings.indexOf(id)
                        if(index != -1){
                            config.meetings.splice(index, 1)
                            fs.writeFile('./config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {}))
                            message.channel.send(":white_check_mark: | Removed successfully.")
                        }
                        else{
                            message.channel.send(":no_entry_sign: | That meeting id isn't in the list.")
                        }
                    }
                    else{
                        message.channel.send(":no_entry_sign: | Specify a valid meeting id.")
                    }
                }
                else if (message.content.startsWith(config.prefix+"meetings")) {
                    if(config.meetings.length>0){
                        const embed = new Discord.MessageEmbed()
                        embed.setTitle("Meeting IDs")
                        embed.setDescription(config.meetings.join("\n"))
                        embed.setColor("BLUE")
                        message.channel.send(embed)
                    }
                    else{
                        message.channel.send(":no_entry_sign: | There's no saved meeting IDs.")
                    }
                }
                else if (message.content.startsWith(config.prefix+"setchannel")) {
                    new Promise(resolve=>{
                        let channel_name = args[0]
                        if(channel_name != "" && channel_name != undefined){
                            channel_name = channel_name.toLowerCase().trim()
                            let channel = ""
                            if(channel_name.includes("<#")){
                                const channel_id = channel_name.replace("<#", "").replace(">", "")
                                channel = message.guild.channels.cache.find(_channel => _channel.id == channel_id && _channel.viewable)
                            }
                            else{
                                channel = message.guild.channels.cache.find(_channel => _channel.name.toLowerCase() == channel_name && _channel.viewable)
                            }
                            if (channel != undefined && channel != ""){
                                resolve(channel.id)
                            }
                            else{
                                message.channel.send(":no_entry_sign: | Couldn't find a channel with that name in this server.")
                                resolve(null)
                            }
                        }
                        else{
                            resolve(message.channel.id)
                        }
                    })
                    .then((channel_id)=>{
                        if(channel_id){
                            new Promise(resolve=>{
                                if(config.message && config.message != ""){
                                    client.channels.fetch(config.channel).then((channel)=>{
                                        channel.messages.fetch(config.message).then((message)=>{
                                            message.delete().then(()=>{}).catch(e=>console.log(e))
                                        })
                                        .catch(e=>console.log(e))
                                    })
                                    .catch(e=>console.log(e))
                                }
                                resolve()
                            })
                            .then(()=>{
                                config.channel = channel_id
                                fs.writeFile('./config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
                                message.channel.send(":white_check_mark: | Set successfully.")
                            })
                        }
                    })
                }
                else if (message.content.startsWith(config.prefix+"help")) {
                    const embed = new Discord.MessageEmbed()
                    .setAuthor("Commands", message.author.displayAvatarURL)
                    .setColor('BLUE')
                    .addField(config.prefix+"addmeeting", "Adds a meeting ID,  E.g. `"+config.prefix+"addmeeting 123456789`.")
                    .addField(config.prefix+"removemeeting", "Deletes a meeting ID,  E.g. `"+config.prefix+"removemeeting 123456789`.")
                    .addField(config.prefix+"meetings", "Lists all the saved meeting IDs.")
                    .addField(config.prefix+"setchannel", "Sets the channel where the meetings participants list will be sent, E.g. `"+config.prefix+"setchannel channelName`, or omit channelName to set the current channel.")
                    message.channel.send({embed})
                }
            }
        }
    }
    catch(e){
        console.log(e)
    }
})

client.on('error', console.error)
client.on('ready', () => {
    client.user.setActivity("Type "+config.prefix+"help")
    console.log('Bot Ready!')
    init()
});

client.login(config.token)