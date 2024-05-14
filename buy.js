"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.processOpenBookMarket = exports.checkMintable = exports.processRaydiumPool = exports.logger = void 0;
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js"); 
const liquidity_1 = require("./liquidity");
const utils_1 = require("./utils");
const utils_2 = require("./utils");
const market_1 = require("./market");
const types_1 = require("./types");
const bs58 = require('bs58');
const pino_1 = __importDefault(require("pino"));
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
  
const transport = pino_1.default.transport({
    targets: [ 
        {
            level: 'trace',
            target: 'pino-pretty',
            options: {},
        },
    ],
});
exports.logger = (0, pino_1.default)({
    level: 'trace',
    redact: ['poolKeys'],
    serializers: {
        error: pino_1.default.stdSerializers.err,
    },
    base: undefined,
}, transport);
const network = 'mainnet-beta';
const RPC_ENDPOINT = (0, utils_2.retrieveEnvVariable)('RPC_ENDPOINT', exports.logger);
const RPC_WEBSOCKET_ENDPOINT = (0, utils_2.retrieveEnvVariable)('RPC_WEBSOCKET_ENDPOINT', exports.logger);
const solanaConnection = new web3_js_1.Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});
let existingLiquidityPools = new Set();
let existingOpenBookMarkets = new Set();
let existingTokenAccounts = new Map();
let wallet;
let quoteToken;
let quoteTokenAssociatedAddress;
let quoteAmount;
let quoteMinPoolSizeAmount;
let commitment = (0, utils_2.retrieveEnvVariable)('COMMITMENT_LEVEL', exports.logger);
const TAKE_PROFIT = Number((0, utils_2.retrieveEnvVariable)('TAKE_PROFIT', exports.logger));
const STOP_LOSS = Number((0, utils_2.retrieveEnvVariable)('STOP_LOSS', exports.logger));
const CHECK_IF_MINT_IS_RENOUNCED = (0, utils_2.retrieveEnvVariable)('CHECK_IF_MINT_IS_RENOUNCED', exports.logger) === 'true';
const USE_SNIPE_LIST = (0, utils_2.retrieveEnvVariable)('USE_SNIPE_LIST', exports.logger) === 'true';
const SNIPE_LIST_REFRESH_INTERVAL = Number((0, utils_2.retrieveEnvVariable)('SNIPE_LIST_REFRESH_INTERVAL', exports.logger));
const AUTO_SELL = (0, utils_2.retrieveEnvVariable)('AUTO_SELL', exports.logger) === 'true';
const MAX_SELL_RETRIES = Number((0, utils_2.retrieveEnvVariable)('MAX_SELL_RETRIES', exports.logger));
const MIN_POOL_SIZE = (0, utils_2.retrieveEnvVariable)('MIN_POOL_SIZE', exports.logger);
const MAX_STAKE_AMOUNT = (0, utils_2.retrieveEnvVariable)('MIN_POOL_SIZE', exports.logger);
let snipeList = [];

function saveTokenAccount(mint, accountData) {
    const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, wallet.publicKey);
    const tokenAccount = {
        address: ata,
        mint: mint,
        market: {
            bids: accountData.bids,
            asks: accountData.asks,
            eventQueue: accountData.eventQueue,
        },
    };
    existingTokenAccounts.set(mint.toString(), tokenAccount);
    return tokenAccount;
}
function processRaydiumPool(id, poolState) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Process Raydium Pool")
        if (!shouldBuy(poolState.baseMint.toString())) {
            return;
        }
        if (CHECK_IF_MINT_IS_RENOUNCED) {
            const mintOption = yield checkMintable(poolState.baseMint);
            if (mintOption !== true) {
                exports.logger.warn({ mint: poolState.baseMint }, 'Skipping, owner can mint tokens!');
                return;
            }
        }
        yield buy(id, poolState);
    });
}
exports.processRaydiumPool = processRaydiumPool;
function checkMintable(vault) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let { data } = (yield solanaConnection.getAccountInfo(vault)) || {};
            if (!data) {
                return;
            }
            const deserialize = types_1.MintLayout.decode(data);
            return deserialize.mintAuthorityOption === 0;
        }
        catch (e) {
            exports.logger.debug(e);
            exports.logger.error({ mint: vault }, `Failed to check if mint is renounced`);
        }
    });
}
exports.checkMintable = checkMintable;
function processOpenBookMarket(updatedAccountInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        let accountData;
        try {
            accountData = raydium_sdk_1.MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
            // to be competitive, we collect market data before buying the token...
            if (existingTokenAccounts.has(accountData.baseMint.toString())) {
                return;
            }
            saveTokenAccount(accountData.baseMint, accountData);
        }
        catch (e) {
            exports.logger.debug(e);
            exports.logger.error({ mint: accountData === null || accountData === void 0 ? void 0 : accountData.baseMint }, `Failed to process market`);
        }
    });
}
exports.processOpenBookMarket = processOpenBookMarket;
function buy(accountId, accountData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());
            if (!tokenAccount) {
                // it's possible that we didn't have time to fetch open book data
                const market = yield (0, market_1.getMinimalMarketV3)(solanaConnection, accountData.marketId, commitment);
                tokenAccount = saveTokenAccount(accountData.baseMint, market);
            }
            tokenAccount.poolKeys = (0, liquidity_1.createPoolKeys)(accountId, accountData, tokenAccount.market);
            const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
                poolKeys: tokenAccount.poolKeys,
                userKeys: {
                    tokenAccountIn: quoteTokenAssociatedAddress,
                    tokenAccountOut: tokenAccount.address,
                    owner: wallet.publicKey,
                },
                amountIn: quoteAmount.raw,
                minAmountOut: 0,
            }, tokenAccount.poolKeys.version);
            const latestBlockhash = yield solanaConnection.getLatestBlockhash({
                commitment: commitment,
            });
            const messageV0 = new web3_js_1.TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [
                    web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
                    web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
                    (0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(wallet.publicKey, tokenAccount.address, wallet.publicKey, accountData.baseMint),
                    ...innerTransaction.instructions,
                ],
            }).compileToV0Message();
            const transaction = new web3_js_1.VersionedTransaction(messageV0);
            transaction.sign([wallet, ...innerTransaction.signers]);
            const rawTransaction = transaction.serialize();
            const signature = yield (0, utils_1.retry)(() => solanaConnection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
            }), { retryIntervalMs: 10, retries: 50 });
            exports.logger.info({ mint: accountData.baseMint, signature }, `Sent buy tx`);
            const confirmation = yield solanaConnection.confirmTransaction({
                signature,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash,
            }, commitment);
            const basePromise = solanaConnection.getTokenAccountBalance(accountData.baseVault, commitment);
            const quotePromise = solanaConnection.getTokenAccountBalance(accountData.quoteVault, commitment);
            yield Promise.all([basePromise, quotePromise]);
            const baseValue = yield basePromise;
            const quoteValue = yield quotePromise;
            if (((_a = baseValue === null || baseValue === void 0 ? void 0 : baseValue.value) === null || _a === void 0 ? void 0 : _a.uiAmount) && ((_b = quoteValue === null || quoteValue === void 0 ? void 0 : quoteValue.value) === null || _b === void 0 ? void 0 : _b.uiAmount))
                tokenAccount.buyValue = ((_c = quoteValue === null || quoteValue === void 0 ? void 0 : quoteValue.value) === null || _c === void 0 ? void 0 : _c.uiAmount) / ((_d = baseValue === null || baseValue === void 0 ? void 0 : baseValue.value) === null || _d === void 0 ? void 0 : _d.uiAmount);
            if (!confirmation.value.err) {
                exports.logger.info({
                    signature,
                    url: `https://solscan.io/tx/${signature}?cluster=${network}`,
                    dex: `https://pump.fun/${accountData.baseMint}`,
                }, `Confirmed buy tx... Bought at: ${tokenAccount.buyValue} SOL`);
            }
            else {
                exports.logger.debug(confirmation.value.err);
                exports.logger.info({ mint: accountData.baseMint, signature }, `Error confirming buy tx`);
            }
        }
        catch (e) {
            exports.logger.debug(e);
            exports.logger.error({ mint: accountData.baseMint }, `Failed to buy token`);
        }
    });
}
function sell(accountId, mint, amount, value) {
    return __awaiter(this, void 0, void 0, function* () {
        let retries = 0;
        do {
            try {
                const tokenAccount = existingTokenAccounts.get(mint.toString());
                if (!tokenAccount) {
                    return true;
                }
                if (!tokenAccount.poolKeys) {
                    exports.logger.warn({ mint }, 'No pool keys found');
                    continue;
                }
                if (amount === 0) {
                    exports.logger.info({
                        mint: tokenAccount.mint,
                    }, `Empty balance, can't sell`);
                    return true;
                }
                // check st/tp
                if (tokenAccount.buyValue === undefined)
                    return true;
                const netChange = (value - tokenAccount.buyValue) / tokenAccount.buyValue;
                if (netChange > STOP_LOSS && netChange < TAKE_PROFIT)
                    return false;
                const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
                    poolKeys: tokenAccount.poolKeys,
                    userKeys: {
                        tokenAccountOut: quoteTokenAssociatedAddress,
                        tokenAccountIn: tokenAccount.address,
                        owner: wallet.publicKey,
                    },
                    amountIn: amount,
                    minAmountOut: 0,
                }, tokenAccount.poolKeys.version);
                const latestBlockhash = yield solanaConnection.getLatestBlockhash({
                    commitment: commitment,
                });
                const messageV0 = new web3_js_1.TransactionMessage({
                    payerKey: wallet.publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: [
                        web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400000 }),
                        web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
                        ...innerTransaction.instructions,
                        (0, spl_token_1.createCloseAccountInstruction)(tokenAccount.address, wallet.publicKey, wallet.publicKey),
                    ],
                }).compileToV0Message();
                const transaction = new web3_js_1.VersionedTransaction(messageV0);
                transaction.sign([wallet, ...innerTransaction.signers]);
                const signature = yield solanaConnection.sendRawTransaction(transaction.serialize(), {
                    preflightCommitment: commitment,
                });
                exports.logger.info({ mint, signature }, `Sent sell tx`);
                const confirmation = yield solanaConnection.confirmTransaction({
                    signature,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                    blockhash: latestBlockhash.blockhash,
                }, commitment);
                if (confirmation.value.err) {
                    exports.logger.debug(confirmation.value.err);
                    exports.logger.info({ mint, signature }, `Error confirming sell tx`);
                    continue;
                }
                exports.logger.info({
                    mint,
                    signature,
                    url: `https://solscan.io/tx/${signature}?cluster=${network}`,
                    dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
                }, `Confirmed sell tx... Sold at: ${value}\tNet Profit: ${netChange * 100}%`);
                return true;
            }
            catch (e) {
                retries++;
                exports.logger.debug(e);
                exports.logger.error({ mint }, `Failed to sell token, retry: ${retries}/${MAX_SELL_RETRIES}`);
            }
        } while (retries < MAX_SELL_RETRIES);
        return true;
    });
} 
function loadSnipeList() {
    if (!USE_SNIPE_LIST) {
        return;
    }
    const count = snipeList.length;
    const data = fs.readFileSync(path.join(__dirname, 'snipe-list.txt'), 'utf-8');
    snipeList = data
        .split('\n')
        .map((a) => a.trim())
        .filter((a) => a);
    if (snipeList.length != count) {
        exports.logger.info(`Loaded snipe list: ${snipeList.length}`);
    }
}
function shouldBuy(key) {
    return USE_SNIPE_LIST ? snipeList.includes(key) : true;
}
const runListener = () => __awaiter(void 0, void 0, void 0, function* () { 
    const runTimestamp = Math.floor(new Date().getTime() / 1000);
    const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(liquidity_1.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
        const key = updatedAccountInfo.accountId.toString();
        const poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
        const existing = existingLiquidityPools.has(key);
        if (poolOpenTime > runTimestamp && !existing) {
            existingLiquidityPools.add(key);
            const _ = processRaydiumPool(updatedAccountInfo.accountId, poolState);
        }
    }), commitment, [
        { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
                bytes: quoteToken.mint.toBase58(),
            },
        },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
                bytes: liquidity_1.OPENBOOK_PROGRAM_ID.toBase58(),
            },
        },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
                bytes: bs58_1.default.encode([6, 0, 0, 0, 0, 0, 0, 0]),
            },
        },
    ]);
    const openBookSubscriptionId = solanaConnection.onProgramAccountChange(liquidity_1.OPENBOOK_PROGRAM_ID, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
        const key = updatedAccountInfo.accountId.toString();
        const existing = existingOpenBookMarkets.has(key);
        if (!existing) {
            existingOpenBookMarkets.add(key);
            const _ = processOpenBookMarket(updatedAccountInfo);
        }
    }), commitment, [
        { dataSize: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.span },
        {
            memcmp: {
                offset: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
                bytes: quoteToken.mint.toBase58(),
            },
        },
    ]);
    if (AUTO_SELL) {
        const pumpfunSubscriptionId = solanaConnection.onProgramAccountChange(spl_token_1.TOKEN_PROGRAM_ID, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
            const accountData = spl_token_1.AccountLayout.decode(updatedAccountInfo.accountInfo.data);
            if (updatedAccountInfo.accountId.equals(quoteTokenAssociatedAddress)) {
                return;
            }
            let completed = false;
            while (!completed) {
                setTimeout(() => { }, 1000);
                const currValue = yield (0, utils_2.retrieveTokenValueByAddress)(accountData.mint.toBase58());
                if (currValue) {
                    exports.logger.info(accountData.mint, `Current Price: ${currValue} SOL`);
                    completed = yield sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, currValue);
                }
            }
        }), commitment, [
            {
                dataSize: 165,
            },
            {
                memcmp: {
                    offset: 32,
                    bytes: wallet.publicKey.toBase58(),
                },
            },
        ]);
        exports.logger.info(`Listening for pump.fun changes: ${pumpfunSubscriptionId}`);
    }
    exports.logger.info(`Listening for raydium changes: ${raydiumSubscriptionId}`);
    exports.logger.info(`Listening for open book changes: ${openBookSubscriptionId}`);
    if (USE_SNIPE_LIST) {
        setInterval(loadSnipeList, SNIPE_LIST_REFRESH_INTERVAL);
    }
});

function init() {
    return __awaiter(this, void 0, void 0, function* () {
        // get wallet
        exports.logger.info(`Your Wallet Address`);
        const PRIVATE_KEY = (0, utils_2.retrieveEnvVariable)('PRIVATE_KEY', exports.logger);  
        wallet = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(PRIVATE_KEY));
        const balance = yield solanaConnection.getBalance(wallet.publicKey); // Lamports
        exports.logger.info(`Your Wallet Address : ${wallet.publicKey}`);
        exports.logger.info(`SOL BALANCE: ${balance}`);
        // get quote mint and amount
        const QUOTE_MINT = (0, utils_2.retrieveEnvVariable)('QUOTE_MINT', exports.logger);
        const QUOTE_AMOUNT = (0, utils_2.retrieveEnvVariable)('QUOTE_AMOUNT', exports.logger); 
        // Convert the balance from lamports to SOL (1 SOL = 1,000,000,000 lamports) 
        switch (QUOTE_MINT) {
            case 'WSOL': {
                quoteToken = raydium_sdk_1.Token.WSOL;
                quoteAmount = new raydium_sdk_1.TokenAmount(raydium_sdk_1.Token.WSOL, QUOTE_AMOUNT, false);
                quoteMinPoolSizeAmount = new raydium_sdk_1.TokenAmount(quoteToken, MIN_POOL_SIZE, false);
                break; 
            }
            default: {
                throw new Error(`Unsupported quote mint "${QUOTE_MINT}". Supported values are USDC and WSOL`);
            }
        }
        exports.logger.info(`Snipe list: ${USE_SNIPE_LIST}`);
        exports.logger.info(`Check mint renounced: ${CHECK_IF_MINT_IS_RENOUNCED}`);
        exports.logger.info(`Min pool size: ${quoteMinPoolSizeAmount.isZero() ? 'false' : quoteMinPoolSizeAmount.toFixed()} ${quoteToken.symbol}`);
        exports.logger.info(`Buy amount: ${quoteAmount.toFixed()} ${quoteToken.symbol}`);
        exports.logger.info(`Auto sell: ${AUTO_SELL}`);
        exports.logger.info(`Max Total Stake: ${MAX_STAKE_AMOUNT}`);
        
        // check existing wallet for associated token account of quote mint
        const tokenAccounts = yield (0, liquidity_1.getTokenAccounts)(solanaConnection, wallet.publicKey, commitment);
        for (const ta of tokenAccounts) {
            existingTokenAccounts.set(ta.accountInfo.mint.toString(), {
                mint: ta.accountInfo.mint,
                address: ta.pubkey,
            });
        } 
        const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString());
        
        if (!tokenAccount) {
            quoteTokenAssociatedAddress = wallet.publicKey;
        }else{
         quoteTokenAssociatedAddress = tokenAccount.pubkey;
        }
        // load tokens to snipe
        loadSnipeList();   
        if(balance == 0){ exports.logger.error(`Not enough WSOL to complete a transaction.`);return;}
        runListener();  
    });
}
init(); 
