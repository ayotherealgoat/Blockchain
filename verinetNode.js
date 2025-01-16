const express = require('express');
const bodyParser = require('body-parser');
const Blockchain = require("./blockchain");
const ramroin = new Blockchain(); 
const uuid = require('uuid');
const nodeAddress = uuid.v1().split('-').join('');
const port = process.argv[2] || 3000;
const cors = require('cors'); 
const rp = require('request-promise');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/blockchain', function (req, res) {
    res.send(ramroin);
});

app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    console.log(req.body);
    const blockIndex = ramroin.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: `Transaction will be added in block ${blockIndex}.` });
});

app.post('/transaction/broadcast', function(req, res) {
    const newTransaction = ramroin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    ramroin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    ramroin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({ note: 'Transaction created and broadcast successfully.' });
        });
});

app.get('/mine', function (req, res) {
    const lastBlock = ramroin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: ramroin.pendingTransactions,
        index: lastBlock['index'] + 1
    };
    const nonce = ramroin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = ramroin.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = ramroin.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = [];
    ramroin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                uri: ramroin.currentNodeUrl + '/transaction/broadcast',
                method: 'POST',
                body: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                },
                json: true
            };
            return rp(requestOptions);
        })
        .then(data => {
            res.json({
                note: "New block mined successfully",
                block: newBlock
            });
        });
});

app.post('/receive-new-block', function(req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = ramroin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        ramroin.chain.push(newBlock);
        ramroin.pendingTransactions = [];
        res.json({
            note: 'New block received and accepted.',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: 'New block rejected.',
            newBlock: newBlock
        });
    }
});

app.post('/register-and-broadcast-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (ramroin.networkNodes.indexOf(newNodeUrl) == -1) ramroin.networkNodes.push(newNodeUrl);

    const regNodesPromises = [];
    ramroin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true
        };

        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
        .then(data => {
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: { allNetworkNodes: [ ...ramroin.networkNodes, ramroin.currentNodeUrl ] },
                json: true
            };

            return rp(bulkRegisterOptions);
        })
        .then(data => {
            res.json({ note: 'New node registered with network successfully.' });
        });
});

app.post('/register-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = ramroin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = ramroin.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) ramroin.networkNodes.push(newNodeUrl);
    res.json({ note: 'New node registered successfully.' });
});

app.post('/register-nodes-bulk', function(req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresent = ramroin.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = ramroin.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) ramroin.networkNodes.push(networkNodeUrl);
    });

    res.json({ note: 'Bulk registration successful.' });
});

app.listen(port, function() {
    console.log(`Listening on port ${port}...`);
});