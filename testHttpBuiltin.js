const http = require('http');

http.get('http://localhost:3004/messages/search?q=d&type=private&senderId=Tripura&recipientId=Mizoram', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Response for private search:");
        console.log(data);
    });
}).on('error', (err) => {
    console.error("HTTP error:", err.message);
});

http.get('http://localhost:3004/messages/search?q=c&type=group&roomId=public', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Response for group search:");
        console.log(data);
    });
});
