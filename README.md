# pump.fun-Token-Swap-Bot
pump.fun Token Swap Bot 
> Please contact me if you have any advice on new features or want to collaberate in the development, I would like to impliment this into a Telegram/Discord Bot at some stage.

## Background
- Just some fun with the Pump.fun market.

## Features
### 💊 Name and Ticker Sniper 
- Configure snipe options and amounts, see formatting below 

## Pre requisites
- Install
https://docs.npmjs.com/downloading-and-installing-node-js-and-npm

For Free RPC nodes, check https://www.quicknode.com/

## Install
>**This is an essential step as you need to install the node_modules from the package.json file.**
```sh
cd path/to/project

npm install
```

## .env Configuration  
```sh
PRIVATE_KEY=
RPC_ENDPOINT=https://api.mainnet-beta.solana.com //Change as required
RPC_WEBSOCKET_ENDPOINT=https://api.mainnet-beta.solana.com //Change as required
QUOTE_MINT=WSOL
QUOTE_AMOUNT=0.0001 //Change as required
COMMITMENT_LEVEL=finalized
USE_SNIPE_LIST=false
SNIPE_LIST_REFRESH_INTERVAL=30000
CHECK_IF_MINT_IS_RENOUNCED=true
AUTO_SELL=true
MAX_SELL_RETRIES=5
AUTO_SELL_DELAY=20000 //ms
LOG_LEVEL=info
TAKE_PROFIT=300
STOP_LOSS=50
BIRDEYE_API_KEY=4a9711ae647
MIN_POOL_SIZE=5
```

**snipe-list formatting**
```sh
Name/Ticker/Wallet
```
For values you dont want to specify leave empty. Each snipe must be on a new line, for example :

```sh
/Ticker/
Name//
//Wallet
```
## Usage
```sh
cd path/to/project

node buy
``` 
  
