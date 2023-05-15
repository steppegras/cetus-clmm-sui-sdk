import Decimal from 'decimal.js';
import { ONE_DAY_SECONDS } from '../types/xcetus_type';
import { extractStructTagFromType } from './contracts';
import { d } from './numbers';
export class XCetusUtil {
    static buildVeNFTDividendInfo(fields) {
        const veNFTDividendInfo = {
            id: fields.id.id,
            ve_nft_id: fields.name,
            rewards: [],
        };
        fields.value.fields.value.fields.dividends.fields.contents.forEach((item) => {
            const periodRewards = [];
            item.fields.value.fields.contents.forEach((reward) => {
                periodRewards.push({
                    coin_type: extractStructTagFromType(reward.fields.key.fields.name).source_address,
                    amount: reward.fields.value,
                });
            });
            veNFTDividendInfo.rewards.push({
                period: Number(item.fields.key),
                rewards: periodRewards,
            });
        });
        return veNFTDividendInfo;
    }
    static buildDividendManager(fields) {
        const dividendManager = {
            id: fields.id.id,
            dividends: {
                id: fields.dividends.fields.id.id,
                size: fields.dividends.fields.size,
            },
            venft_dividends: {
                id: fields.venft_dividends.fields.id.id,
                size: fields.venft_dividends.fields.size,
            },
            bonus_types: [],
            start_time: Number(fields.start_time),
            interval_day: Number(fields.interval_day),
            balances: {
                id: fields.balances.fields.id.id,
                size: fields.balances.fields.size,
            },
            is_open: true,
        };
        fields.bonus_types.forEach((item) => {
            dividendManager.bonus_types.push(extractStructTagFromType(item.fields.name).source_address);
        });
        return dividendManager;
    }
    static buildLockCetus(data) {
        const fields = data.fields;
        const lockCetus = {
            id: fields.id.id,
            type: extractStructTagFromType(data.type).source_address,
            locked_start_time: Number(fields.locked_start_time),
            locked_until_time: Number(fields.locked_until_time),
            cetus_amount: fields.balance,
            xcetus_amount: '0',
            lock_day: 0,
        };
        lockCetus.lock_day = (lockCetus.locked_until_time - lockCetus.locked_start_time) / ONE_DAY_SECONDS;
        return lockCetus;
    }
    static getAvailableXCetus(veNTF, locks) {
        let lockAmount = d(0);
        locks.forEach((lock) => {
            lockAmount = lockAmount.add(lock.xcetus_amount);
        });
        return d(veNTF.xcetus_balance).sub(lockAmount).toString();
    }
    static getWaitUnLockCetuss(locks) {
        return locks.filter((lock) => {
            return !XCetusUtil.isLocked(lock);
        });
    }
    static getLockingCetuss(locks) {
        return locks.filter((lock) => {
            return XCetusUtil.isLocked(lock);
        });
    }
    static isLocked(lock) {
        return lock.locked_until_time > Date.parse(new Date().toString()) / 1000;
    }
    static getNextStartTime(dividendManager) {
        const currentTime = Date.parse(new Date().toString()) / 1000;
        const currentPeriod = d(currentTime)
            .sub(dividendManager.start_time)
            .div(d(dividendManager.interval_day).mul(24 * 3600))
            .toFixed(0, Decimal.ROUND_UP);
        const nextStartTime = d(dividendManager.start_time).add(d(currentPeriod).mul(24 * 3600));
        return nextStartTime;
    }
}
