import BN from 'bn.js';
import { Graph, GraphEdge, GraphVertex } from '@syntsugar/cc-graph';
import { createSplitAmountArray, findBestSplitSteps, getTickDataFromUrlData, SplitSwap, SplitUnit, U64_MAX, ZERO } from '../math';
const REFRESH_TIME_INTERVAL = 30000; // 30s
function _pairSymbol(base, quote) {
    return {
        pair: `${base}-${quote}`,
        reversePair: `${quote}-${base}`,
    };
}
export class RouterModule {
    constructor(sdk) {
        this.pathProviders = [];
        this.coinProviders = {
            coins: [],
        };
        this.graph = new Graph();
        this._coinAddressMap = new Map();
        this.poolAddressMap = new Map();
        this.poolMap = new Map();
        this.ticksMap = new Map();
        this._sdk = sdk;
        this.leastRefreshTime = Date.now();
        this.createTxParams = {
            paths: [],
            partner: '',
            priceSplitPoint: 1,
        };
        this.poolDirectionMap = new Map();
        this.isInited = false;
        this.getPoolAddressMapAndDirection = this.getPoolAddressMapAndDirection.bind(this);
        this.setCoinList = this.setCoinList.bind(this);
        this.loadGraph = this.loadGraph.bind(this);
        this.getPoolAddress = this.getPoolAddress.bind(this);
        this.addCoinProvider = this.addCoinProvider.bind(this);
        this.addPathProvider = this.addPathProvider.bind(this);
        this.transformPathResult = this.transformPathResult.bind(this);
        this.refreshPoolofSwapRouter = this.refreshPoolofSwapRouter.bind(this);
        this.getBestStepResult = this.getBestStepResult.bind(this);
        this.findOnePath = this.findOnePath.bind(this);
        this.findBestRouter = this.findBestRouter.bind(this);
        this.getBestPathResult = this.getBestPathResult.bind(this);
        this.getBestRouterResult = this.getBestRouterResult.bind(this);
        this.price = this.price.bind(this);
    }
    get sdk() {
        return this._sdk;
    }
    getPoolAddressMapAndDirection(base, quote) {
        const { pair, reversePair } = _pairSymbol(base, quote);
        let addressMap = this.poolAddressMap.get(pair);
        if (addressMap != null) {
            return {
                addressMap,
                direction: true,
            };
        }
        addressMap = this.poolAddressMap.get(reversePair);
        if (addressMap != null) {
            return {
                addressMap,
                direction: false,
            };
        }
        return undefined;
    }
    setCoinList() {
        this.coinProviders.coins.forEach((coin) => {
            this._coinAddressMap.set(coin.address, coin);
        });
    }
    loadGraph() {
        this.pathProviders.forEach((provider) => {
            const { paths } = provider;
            paths.forEach((path) => {
                const vertexA = this.graph.getVertexByKey(path.base) ?? new GraphVertex(path.base);
                const vertexB = this.graph.getVertexByKey(path.quote) ?? new GraphVertex(path.quote);
                this.graph.addEdge(new GraphEdge(vertexA, vertexB));
                const coinA = this._coinAddressMap.get(path.base);
                const coinB = this._coinAddressMap.get(path.quote);
                if (coinA != null && coinB != null) {
                    const poolSymbol = _pairSymbol(path.base, path.quote).pair;
                    this.poolAddressMap.set(poolSymbol, path.addressMap);
                }
            });
        });
    }
    addPathProvider(provider) {
        // fix all order about base and quote in paths
        for (let i = 0; i < provider.paths.length; i += 1) {
            const { base, quote } = provider.paths[i];
            const compareResult = base.localeCompare(quote);
            if (compareResult < 0) {
                provider.paths[i].base = quote;
                provider.paths[i].quote = base;
            }
        }
        this.pathProviders.push(provider);
        return this;
    }
    addCoinProvider(provider) {
        this.coinProviders = provider;
        return this;
    }
    tokenInfo(key) {
        return this._coinAddressMap.get(key);
    }
    getCreateTxParams() {
        return this.createTxParams;
    }
    isPoolDirectionSet(poolAddress) {
        if (this.poolDirectionMap.get(poolAddress) != null) {
            return true;
        }
        return false;
    }
    getPoolDirection(poolAddress) {
        if (this.isPoolDirectionSet(poolAddress)) {
            return this.poolDirectionMap.get(poolAddress);
        }
        return undefined;
    }
    setPoolDirection(poolAddress, direction) {
        this.poolDirectionMap.set(poolAddress, direction);
    }
    getPoolAddress(base, quote, feeRate) {
        const directedMap = this.getPoolAddressMapAndDirection(base, quote);
        if (directedMap != null) {
            const { addressMap } = directedMap;
            const poolAddress = addressMap.get(feeRate);
            if (poolAddress != null) {
                return poolAddress;
            }
        }
        return '';
    }
    getBestStepResult(splitUnit, base, quote, amount, a2b, byAmountIn) {
        if (amount.eq(ZERO)) {
            return {
                stepAmount: ZERO,
                isExceed: false,
                splitSteps: [],
            };
        }
        const routerTable = [];
        const feeRateArray = [];
        const exceedTable = [];
        const poolAddresses = [];
        const swapDirect = [];
        const addressMapAndDirection = this.getPoolAddressMapAndDirection(base, quote);
        const addressMap = addressMapAndDirection?.addressMap;
        if (addressMap) {
            for (const [feeRate, pool] of addressMap.entries()) {
                const clmmpool = this.poolMap.get(pool);
                const loadDirect = this.poolDirectionMap.get(pool);
                // NOT XOR
                const direct = a2b === loadDirect;
                const tickData = this.ticksMap.get(pool);
                const splitSwap = new SplitSwap(amount, splitUnit, clmmpool, direct, byAmountIn, tickData);
                const splitSwapResult = splitSwap.computeSwap();
                if (byAmountIn) {
                    routerTable.push(splitSwapResult.amountOutArray);
                }
                else {
                    routerTable.push(splitSwapResult.amountInArray);
                }
                exceedTable.push(splitSwapResult.isExceed);
                feeRateArray.push(feeRate);
                poolAddresses.push(pool);
                swapDirect.push(direct);
            }
        }
        // now the max number of pools has the same coin pair is 4
        return findBestSplitSteps(routerTable.slice(0, 4), feeRateArray.slice(0, 4), poolAddresses.slice(0, 4), exceedTable.slice(0, 4), swapDirect.slice(0, 4), byAmountIn);
    }
    getBestPathResult(baseQuoteArray, a2b, splitUnit, amount, byAmountIn) {
        if (baseQuoteArray.length === 2) {
            if (a2b.length !== 1) {
                throw new Error('baseQuoteArray length is 2, a2b length should be 1');
            }
            const stepOne = this.getBestStepResult(splitUnit, baseQuoteArray[0], baseQuoteArray[1], amount, a2b[0], byAmountIn);
            const { isExceed, stepAmount } = stepOne;
            return { steps: [stepOne], totalAmount: stepAmount, isExceed };
        }
        let stepOne = {
            stepAmount: ZERO,
            isExceed: false,
            splitSteps: [],
        };
        let stepTwo = {
            stepAmount: ZERO,
            isExceed: false,
            splitSteps: [],
        };
        if (byAmountIn) {
            stepOne = this.getBestStepResult(splitUnit, baseQuoteArray[0], baseQuoteArray[1], amount, a2b[0], byAmountIn);
            stepTwo = this.getBestStepResult(splitUnit, baseQuoteArray[2], baseQuoteArray[3], stepOne.stepAmount, a2b[1], byAmountIn);
        }
        else {
            stepTwo = this.getBestStepResult(splitUnit, baseQuoteArray[2], baseQuoteArray[3], amount, a2b[1], byAmountIn);
            stepOne = this.getBestStepResult(splitUnit, baseQuoteArray[0], baseQuoteArray[1], stepTwo.stepAmount, a2b[0], byAmountIn);
        }
        const totalAmount = byAmountIn ? stepTwo.stepAmount : stepOne.stepAmount;
        const isExceed = stepOne.isExceed || stepTwo.isExceed;
        return { steps: [stepOne, stepTwo], totalAmount, isExceed };
    }
    transformPathResult(baseQuoteArray, splitUnit, splitNums, twoSteps, amount, byAmountIn) {
        const amounts0 = [];
        const amounts1 = [];
        const addresses0 = [];
        const addresses1 = [];
        const percents0 = [];
        const percents1 = [];
        const a2b0 = [];
        const a2b1 = [];
        if (baseQuoteArray.length === 2) {
            twoSteps[0].splitSteps.forEach((path) => {
                amounts0.push(amount
                    .muln(splitNums * splitUnit)
                    .divn(100)
                    .muln(path.splitStepPercent)
                    .divn(100));
                percents0.push(path.splitStepPercent);
                const address = this.getPoolAddress(baseQuoteArray[0], baseQuoteArray[1], path.feeRate);
                if (address.length === 0) {
                    throw new Error('Address is empty, you should check the pool address map');
                }
                addresses0.push(address);
                a2b0.push(path.a2b);
            });
            const StepOne = {
                addressArr: addresses0,
                amountArr: amounts0,
                percentArr: percents0,
                a2bArr: a2b0,
            };
            return [StepOne];
        }
        twoSteps[0].splitSteps.forEach((path) => {
            if (byAmountIn) {
                amounts0.push(amount
                    .muln(splitNums * splitUnit)
                    .divn(100)
                    .muln(path.splitStepPercent)
                    .divn(100));
            }
            else {
                amounts0.push(twoSteps[1].stepAmount.muln(path.splitStepPercent).divn(100));
            }
            percents0.push(path.splitStepPercent);
            const address = this.getPoolAddress(baseQuoteArray[0], baseQuoteArray[1], path.feeRate);
            if (address.length === 0) {
                throw new Error('Address is empty, you should check the pool address map');
            }
            addresses0.push(address);
            a2b0.push(path.a2b);
        });
        twoSteps[1].splitSteps.forEach((path) => {
            if (byAmountIn) {
                amounts1.push(twoSteps[0].stepAmount.muln(path.splitStepPercent).divn(100));
            }
            else {
                amounts1.push(amount
                    .muln(splitNums * splitUnit)
                    .divn(100)
                    .muln(path.splitStepPercent)
                    .divn(100));
            }
            percents1.push(path.splitStepPercent);
            const address = this.getPoolAddress(baseQuoteArray[2], baseQuoteArray[3], path.feeRate);
            if (address.length === 0) {
                throw new Error('Address is empty, you should check the pool address map');
            }
            addresses1.push(address);
            a2b1.push(path.a2b);
        });
        const StepOne = {
            addressArr: addresses0,
            amountArr: amounts0,
            percentArr: percents0,
            a2bArr: a2b0,
        };
        const StepTwo = {
            addressArr: addresses1,
            amountArr: amounts1,
            percentArr: percents1,
            a2bArr: a2b1,
        };
        return [StepOne, StepTwo];
    }
    findOnePath(baseQuoteArray, amount, splitNums, splitUnit, a2b, byAmountIn) {
        const onePath = {
            amountIn: ZERO,
            amountOut: ZERO,
            poolAddress: [],
            a2b: [],
            rawAmountLimit: [],
            isExceed: false,
            coinType: [],
        };
        const actualAmount = amount.muln(splitNums * splitUnit).divn(100);
        if (actualAmount.eq(ZERO)) {
            return onePath;
        }
        const { steps, totalAmount, isExceed } = this.getBestPathResult(baseQuoteArray, a2b, splitUnit, amount, byAmountIn);
        if (isExceed) {
            onePath.isExceed = isExceed;
            return onePath;
        }
        const firstPathResult = this.transformPathResult(baseQuoteArray, splitUnit, splitNums, steps, amount, byAmountIn);
        if (firstPathResult.length > 1) {
            if (byAmountIn) {
                onePath.amountIn = actualAmount;
                onePath.amountOut = totalAmount;
                onePath.rawAmountLimit.push(firstPathResult[1].amountArr[0], totalAmount);
            }
            else {
                onePath.amountIn = totalAmount;
                onePath.amountOut = actualAmount;
                onePath.rawAmountLimit.push(totalAmount, firstPathResult[0].amountArr[0]);
            }
            onePath.a2b.push(firstPathResult[0].a2bArr[0], firstPathResult[1].a2bArr[0]);
            onePath.poolAddress.push(firstPathResult[0].addressArr[0], firstPathResult[1].addressArr[0]);
            onePath.coinType.push(baseQuoteArray[0], baseQuoteArray[1], baseQuoteArray[3]);
            return onePath;
        }
        if (byAmountIn) {
            onePath.amountIn = actualAmount;
            onePath.amountOut = totalAmount;
        }
        else {
            onePath.amountIn = totalAmount;
            onePath.amountOut = actualAmount;
        }
        onePath.a2b.push(firstPathResult[0].a2bArr[0]);
        onePath.rawAmountLimit.push(totalAmount);
        onePath.poolAddress.push(firstPathResult[0].addressArr[0]);
        onePath.coinType.push(baseQuoteArray[0], baseQuoteArray[1]);
        return onePath;
    }
    findBestRouter(baseQuoteArray, amount, splitUnit, a2b, byAmountIn) {
        let paths = [];
        const splitIntervalArray = createSplitAmountArray(amount, splitUnit);
        let tempMaxAmount = byAmountIn ? ZERO : U64_MAX;
        const routerLength = baseQuoteArray.length;
        if (routerLength > 1) {
            for (let a = 0; a < splitIntervalArray.length; a += 1) {
                if (routerLength > 2) {
                    for (let b = 0; b < splitIntervalArray.length - a - 1; b += 1) {
                        if (routerLength > 3) {
                            for (let c = 0; c < splitIntervalArray.length - a - b - 1; c += 1) {
                                const d = splitIntervalArray.length - a - b - c - 1;
                                const path0 = this.findOnePath(baseQuoteArray[0], splitIntervalArray[a], 1, SplitUnit.HUNDRED, a2b[0], byAmountIn);
                                const path1 = this.findOnePath(baseQuoteArray[1], splitIntervalArray[b], 1, SplitUnit.HUNDRED, a2b[1], byAmountIn);
                                const path2 = this.findOnePath(baseQuoteArray[2], splitIntervalArray[c], 1, SplitUnit.HUNDRED, a2b[2], byAmountIn);
                                const path3 = this.findOnePath(baseQuoteArray[3], splitIntervalArray[d], 1, SplitUnit.HUNDRED, a2b[3], byAmountIn);
                                const sumAmount = byAmountIn
                                    ? path0.amountOut.add(path1.amountOut).add(path2.amountOut).add(path3.amountOut)
                                    : path0.amountIn.add(path1.amountIn).add(path2.amountIn).add(path3.amountIn);
                                if ((byAmountIn && sumAmount.gt(tempMaxAmount)) || (!byAmountIn && sumAmount.lt(tempMaxAmount))) {
                                    const tempPath = [];
                                    if (path0.a2b.length !== 0) {
                                        tempPath.push(path0);
                                    }
                                    if (path1.a2b.length !== 0) {
                                        tempPath.push(path1);
                                    }
                                    if (path2.a2b.length !== 0) {
                                        tempPath.push(path2);
                                    }
                                    if (path3.a2b.length !== 0) {
                                        tempPath.push(path3);
                                    }
                                    paths = tempPath;
                                    tempMaxAmount = sumAmount;
                                }
                            }
                        }
                        else {
                            const c = splitIntervalArray.length - a - b - 1;
                            const path0 = this.findOnePath(baseQuoteArray[0], splitIntervalArray[a], 1, SplitUnit.HUNDRED, a2b[0], byAmountIn);
                            const path1 = this.findOnePath(baseQuoteArray[1], splitIntervalArray[b], 1, SplitUnit.HUNDRED, a2b[1], byAmountIn);
                            const path2 = this.findOnePath(baseQuoteArray[2], splitIntervalArray[c], 1, SplitUnit.HUNDRED, a2b[2], byAmountIn);
                            const sumAmount = byAmountIn
                                ? path0.amountOut.add(path1.amountOut).add(path2.amountOut)
                                : path0.amountIn.add(path1.amountIn).add(path2.amountIn);
                            if ((byAmountIn && sumAmount.gt(tempMaxAmount)) || (!byAmountIn && sumAmount.lt(tempMaxAmount))) {
                                const tempPath = [];
                                if (path0.a2b.length !== 0) {
                                    tempPath.push(path0);
                                }
                                if (path1.a2b.length !== 0) {
                                    tempPath.push(path1);
                                }
                                if (path2.a2b.length !== 0) {
                                    tempPath.push(path2);
                                }
                                paths = tempPath;
                                tempMaxAmount = sumAmount;
                            }
                        }
                    }
                }
                else {
                    const b = splitIntervalArray.length - a - 1;
                    const path0 = this.findOnePath(baseQuoteArray[0], splitIntervalArray[a], 1, SplitUnit.HUNDRED, a2b[0], byAmountIn);
                    const path1 = this.findOnePath(baseQuoteArray[1], splitIntervalArray[b], 1, SplitUnit.HUNDRED, a2b[1], byAmountIn);
                    const sumAmount = byAmountIn ? path0.amountOut.add(path1.amountOut) : path0.amountIn.add(path1.amountIn);
                    if ((byAmountIn && sumAmount.gt(tempMaxAmount)) || (!byAmountIn && sumAmount.lt(tempMaxAmount))) {
                        const tempPath = [];
                        if (path0.a2b.length !== 0) {
                            tempPath.push(path0);
                        }
                        if (path1.a2b.length !== 0) {
                            tempPath.push(path1);
                        }
                        paths = tempPath;
                        tempMaxAmount = sumAmount;
                    }
                }
            }
        }
        else {
            const path = this.findOnePath(baseQuoteArray[0], amount, 1, SplitUnit.HUNDRED, a2b[0], byAmountIn);
            paths.push(path);
        }
        return paths;
    }
    getBestRouterResult(baseQuoteArray, amount, a2b, byAmountIn) {
        const result = {
            amountIn: ZERO,
            amountOut: ZERO,
            paths: [],
            isExceed: false,
            byAmountIn,
        };
        let paths = [];
        if (baseQuoteArray.length === 1 && baseQuoteArray[0].length === 2) {
            const onePath = this.getBestStepResult(SplitUnit.FIVE, baseQuoteArray[0][0], baseQuoteArray[0][1], amount, a2b[0][0], byAmountIn);
            for (let i = 0; i < onePath.splitSteps.length; i += 1) {
                const path = {
                    amountIn: ZERO,
                    amountOut: ZERO,
                    poolAddress: [],
                    a2b: [],
                    rawAmountLimit: [],
                    isExceed: false,
                    coinType: [],
                };
                if (byAmountIn) {
                    path.amountIn = amount.muln(onePath.splitSteps[i].splitStepPercent).divn(100);
                    path.amountOut = new BN(onePath.splitSteps[i].splitStepAmount);
                    path.rawAmountLimit.push(path.amountOut);
                }
                else {
                    path.amountIn = new BN(onePath.splitSteps[i].splitStepAmount);
                    path.amountOut = amount.muln(onePath.splitSteps[i].splitStepPercent).divn(100);
                    path.rawAmountLimit.push(path.amountIn);
                }
                path.poolAddress.push(onePath.splitSteps[i].pool);
                path.a2b.push(onePath.splitSteps[i].a2b);
                path.coinType.push(baseQuoteArray[0][0], baseQuoteArray[0][1]);
                paths.push(path);
            }
        }
        else {
            paths = this.findBestRouter(baseQuoteArray, amount, SplitUnit.FIVE, a2b, byAmountIn);
        }
        if (paths.length === 0) {
            result.isExceed = true;
            return result;
        }
        let sumAmountIn = ZERO;
        let sumAmountOut = ZERO;
        for (let i = 0; i < paths.length; i += 1) {
            sumAmountIn = sumAmountIn.add(paths[i].amountIn);
            sumAmountOut = sumAmountOut.add(paths[i].amountOut);
        }
        if (byAmountIn) {
            result.amountIn = amount;
            result.amountOut = sumAmountOut;
        }
        else {
            result.amountIn = sumAmountIn;
            result.amountOut = amount;
        }
        for (let i = 0; i < paths.length; i += 1) {
            for (let j = 0; j < paths[i].coinType.length; j += 1) {
                const coin = this._coinAddressMap.get(paths[i].coinType[j]);
                if (coin != null) {
                    paths[i].coinType[j] = coin.address;
                }
                else {
                    throw new Error('Coin symbol not found');
                }
            }
        }
        result.paths = paths;
        return result;
    }
    findUnFetchPools(poolAddresses) {
        const unFetchPools = [];
        for (const poolAddress of poolAddresses) {
            const pool = this.poolMap.get(poolAddress);
            if (pool != null) {
                continue;
            }
            else {
                unFetchPools.push(poolAddress);
            }
        }
        return unFetchPools;
    }
    async refreshPoolofSwapRouter(poolAddresses) {
        let unFetchPools = [];
        const currentTime = Date.now();
        if (this.isInited) {
            unFetchPools = this.findUnFetchPools(poolAddresses);
            if (currentTime - this.leastRefreshTime < REFRESH_TIME_INTERVAL && unFetchPools.length === 0) {
                return;
            }
        }
        else {
            this.isInited = true;
        }
        const pools = await this._sdk.Resources.getPools(poolAddresses);
        for (let i = 0; i < poolAddresses.length; i += 1) {
            this.poolMap.set(pools[i].poolAddress, pools[i]);
            if (this.getPoolDirection(pools[i].poolAddress) == null) {
                const coinA = this._coinAddressMap.get(pools[i].coinTypeA)?.address;
                const coinB = this._coinAddressMap.get(pools[i].coinTypeB)?.address;
                const poolAndDirection = this.getPoolAddressMapAndDirection(coinA, coinB)?.direction;
                this.poolDirectionMap.set(pools[i].poolAddress, poolAndDirection);
                // eslint-disable-next-line no-await-in-loop
                const ticks = await this._sdk.Pool.fetchTicksByRpc(pools[i].ticks_handle);
                const ticksData = getTickDataFromUrlData(ticks);
                this.ticksMap.set(pools[i].poolAddress, ticksData);
            }
        }
        this.leastRefreshTime = currentTime;
    }
    async price(base, quote, amount, byAmountIn, priceSplitPoint, partner) {
        const baseCoin = this.tokenInfo(base);
        const quoteCoin = this.tokenInfo(quote);
        if (baseCoin === undefined || quoteCoin === undefined) {
            return undefined;
        }
        const sourceVertex = this.graph.getVertexByKey(baseCoin.address);
        const targetVertex = this.graph.getVertexByKey(quoteCoin.address);
        // find all paths
        const pathIter = this.graph.findAllPath(sourceVertex, targetVertex);
        const allPaths = Array.from(pathIter);
        console.log('allPaths', allPaths);
        // refresh pool with time interval 60s
        const updatePoolAddresses = [];
        const baseQuoteArray = [];
        const swapDirections = [];
        for (let i = 0; i < allPaths.length; i += 1) {
            const path = allPaths[i];
            // only consider one and two pair path
            if (path.length > 3) {
                continue;
            }
            const baseQuote = [];
            const swapDirection = [];
            for (let j = 0; j < path.length - 1; j += 1) {
                const base = path[j].value.toString();
                const quote = path[j + 1].value.toString();
                const addressMap = this.getPoolAddressMapAndDirection(base, quote)?.addressMap;
                const direction = this.getPoolAddressMapAndDirection(base, quote)?.direction;
                // console.log('🚀 ~ file: routerModule.ts:823 ~ RouterModule ~ price ~ addressMap:', addressMap)
                if (addressMap !== undefined && direction !== undefined) {
                    swapDirection.push(direction);
                    baseQuote.push(base);
                    baseQuote.push(quote);
                    addressMap.forEach((address) => {
                        updatePoolAddresses.push(address);
                    });
                }
            }
            swapDirections.push(swapDirection);
            baseQuoteArray.push(baseQuote);
            // directed router always put in the first
            if (baseQuote.length === 2 && baseQuoteArray.length > 1) {
                const tempBaseQuote = baseQuoteArray[0].slice();
                baseQuoteArray[0] = baseQuote;
                baseQuoteArray[baseQuoteArray.length - 1] = tempBaseQuote;
                const tempSwapDirection = swapDirections[0].slice();
                swapDirections[0] = swapDirection;
                swapDirections[baseQuoteArray.length - 1] = tempSwapDirection;
            }
        }
        await this.refreshPoolofSwapRouter(updatePoolAddresses);
        const router = this.getBestRouterResult(baseQuoteArray, amount, swapDirections, byAmountIn);
        this.createTxParams = {
            paths: router.paths,
            priceSplitPoint,
            partner,
        };
        return router;
    }
}
