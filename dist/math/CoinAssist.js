// Copyright (c) 2022, Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { extractStructTagFromType } from '../utils/contracts';
// import BN from 'bn.js'
const COIN_TYPE = '0x2::coin::Coin';
const COIN_TYPE_ARG_REGEX = /^0x2::coin::Coin<(.+)>$/;
export const DEFAULT_GAS_BUDGET_FOR_SPLIT = 1000;
export const DEFAULT_GAS_BUDGET_FOR_MERGE = 500;
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER = 100;
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER_SUI = 100;
export const DEFAULT_GAS_BUDGET_FOR_STAKE = 1000;
export const GAS_TYPE_ARG = '0x2::sui::SUI';
export const GAS_SYMBOL = 'SUI';
export const DEFAULT_NFT_TRANSFER_GAS_FEE = 450;
export const SUI_SYSTEM_STATE_OBJECT_ID = '0x0000000000000000000000000000000000000005';
export class CoinAssist {
    static getCoinTypeArg(obj) {
        const res = obj.type.match(COIN_TYPE_ARG_REGEX);
        return res ? res[1] : null;
    }
    static isSUI(obj) {
        const arg = CoinAssist.getCoinTypeArg(obj);
        return arg ? CoinAssist.getCoinSymbol(arg) === 'SUI' : false;
    }
    static getCoinSymbol(coinTypeArg) {
        return coinTypeArg.substring(coinTypeArg.lastIndexOf(':') + 1);
    }
    static getBalance(obj) {
        return BigInt(obj.fields.balance);
    }
    static totalBalance(objs, coinAddress) {
        let balanceTotal = BigInt(0);
        objs.forEach((obj) => {
            if (coinAddress === obj.coinAddress) {
                balanceTotal += BigInt(obj.balance);
            }
        });
        return balanceTotal;
    }
    static getID(obj) {
        return obj.fields.id.id;
    }
    static getCoinTypeFromArg(coinTypeArg) {
        return `${COIN_TYPE}<${coinTypeArg}>`;
    }
    static getFaucetCoins(suiTransactionResponse) {
        const { events } = suiTransactionResponse;
        const faucetCoin = [];
        events?.forEach((item) => {
            const { type } = item;
            if (extractStructTagFromType(type).name === 'InitEvent') {
                const fields = item.parsedJson;
                faucetCoin.push({
                    transactionModule: item.transactionModule,
                    suplyID: fields.suplyID,
                    decimals: fields.decimals,
                });
            }
        });
        return faucetCoin;
    }
    static getCoinAssets(coinType, allSuiObjects) {
        const coins = [];
        allSuiObjects.forEach((anObj) => {
            if (anObj.coinAddress === coinType) {
                coins.push(anObj);
            }
        });
        return coins;
    }
    static isSuiCoin(coinAddress) {
        return extractStructTagFromType(coinAddress).full_address === GAS_TYPE_ARG;
    }
    static selectCoinObjectIdGreaterThanOrEqual(coins, amount, exclude = []) {
        const objectArray = CoinAssist.selectCoinAssetGreaterThanOrEqual(coins, amount, exclude).selectedCoins.map((item) => item.coinObjectId);
        const remainCoins = CoinAssist.selectCoinAssetGreaterThanOrEqual(coins, amount, exclude).remainingCoins;
        return { objectArray, remainCoins };
    }
    static selectCoinAssetGreaterThanOrEqual(coins, amount, exclude = []) {
        const sortedCoins = CoinAssist.sortByBalance(coins.filter((c) => !exclude.includes(c.coinObjectId)));
        const total = CoinAssist.calculateTotalBalance(sortedCoins);
        if (total < amount) {
            return { selectedCoins: [], remainingCoins: sortedCoins };
        }
        if (total === amount) {
            return { selectedCoins: sortedCoins, remainingCoins: [] };
        }
        let sum = BigInt(0);
        const selectedCoins = [];
        const remainingCoins = [...sortedCoins];
        while (sum < total) {
            const target = amount - sum;
            const coinWithSmallestSufficientBalanceIndex = remainingCoins.findIndex((c) => c.balance >= target);
            if (coinWithSmallestSufficientBalanceIndex !== -1) {
                selectedCoins.push(remainingCoins[coinWithSmallestSufficientBalanceIndex]);
                remainingCoins.splice(coinWithSmallestSufficientBalanceIndex, 1);
                break;
            }
            const coinWithLargestBalance = remainingCoins.pop();
            if (coinWithLargestBalance.balance > 0) {
                selectedCoins.push(coinWithLargestBalance);
                sum += coinWithLargestBalance.balance;
            }
        }
        return { selectedCoins: CoinAssist.sortByBalance(selectedCoins), remainingCoins: CoinAssist.sortByBalance(remainingCoins) };
    }
    /**
     * Sort coin by balance in an ascending order
     */
    static sortByBalance(coins) {
        // eslint-disable-next-line no-nested-ternary
        return coins.sort((a, b) => (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0));
    }
    static sortByBalanceDes(coins) {
        // eslint-disable-next-line no-nested-ternary
        return coins.sort((a, b) => (a.balance > b.balance ? -1 : a.balance < b.balance ? 0 : 1));
    }
    // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
    static calculateTotalBalance(coins) {
        return coins.reduce((partialSum, c) => partialSum + c.balance, BigInt(0));
    }
}
