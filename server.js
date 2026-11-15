const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
    let parsedUrl = req.url.split('?')[0];
    let filePath = parsedUrl === '/' ? 'index.html' : parsedUrl;
    
    if (filePath.startsWith('/')) {
        filePath = filePath.substring(1);
    }

    let fullPath = path.join(__dirname, filePath);

    const extname = path.extname(fullPath);
    let contentType = 'text/html';
    switch (extname) {
        case '.css': contentType = 'text/css'; break;
        case '.js': contentType = 'application/javascript'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
    }

    fs.readFile(fullPath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("Fayl tapılmadı: " + req.url);
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    });
});

const wss = new WebSocket.Server({ server });

let idCounter = 1;
let connectedPlayers = [];
let gameStarted = false; 

wss.on('connection', (ws) => {
    const clientId = "PLAYER_" + idCounter++;
    ws.isController = false; 
    console.log(`${clientId} səhifəyə qoşuldu!`);

    ws.on('message', (message) => {
        try {
            let data = JSON.parse(message.toString());

            if (data.type === "PLAYER_JOIN") {
                if (gameStarted) {
                    ws.send(JSON.stringify({ type: "GAME_STARTED_ALREADY", message: "Oyun artıq başlayıb!" }));
                    ws.close();
                    return;
                }

                if (connectedPlayers.length >= 6) {
                    ws.send(JSON.stringify({ type: "LOBBY_FULL", message: "Lobbi doludur (Max 6 oyunçu)" }));
                    ws.close();
                    return;
                }

                ws.isController = true;
                ws.clientId = clientId;
                ws.nickname = data.nickname;

                connectedPlayers = connectedPlayers.filter(p => p.id !== clientId);
                connectedPlayers.push({ id: clientId, nickname: data.nickname });
                console.log(`Oyunçu lobiye qatıldı: ${data.nickname} (${clientId}) - Cəmi: ${connectedPlayers.length}/6`);

                broadcastLobbyState();
                return;
            }

            if (data.type === "START_GAME") {
                gameStarted = true;
                console.log("Oyun başladı! Yeni qoşulmalar bloklandı.");
                return;
            }

            // Əgər Unity-dən Dash və ya Action təsdiqi gələrsə, YALNIZ həmin clientId-yə sahib pulta göndəririk!
            if (data.type === "DASH_STARTED" || data.type === "ACTION_STARTED") {
                const targetClientId = data.clientId;
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client.isController && client.clientId === targetClientId) {
                        client.send(JSON.stringify(data));
                    }
                });
                return;
            }

            // Pultdan gələn hərəkət dataları
            data.clientId = clientId; 
            const outgoingData = JSON.stringify(data);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && !client.isController) {
                    client.send(outgoingData);
                }
            });

        } catch (e) {}
    });

    ws.on('close', () => {
        console.log(`${clientId} bağlantını kəsdi.`);
        connectedPlayers = connectedPlayers.filter(p => p.id !== clientId);
        broadcastLobbyState();
    });
});

function broadcastLobbyState() {
    const lobbyMessage = JSON.stringify({
        type: "LOBBY_UPDATE",
        players: connectedPlayers
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(lobbyMessage);
        }
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server işləyir: port ${PORT}`);
});