import BN from 'bn.js';
import Decimal from '../utils/decimal';
export declare const ZERO: BN;
export declare const ONE: BN;
export declare const TWO: BN;
export declare const U128: BN;
export declare const U64_MAX: BN;
export declare const U128_MAX: BN;
/**
 * @category MathUtil
 */
export declare class MathUtil {
    static toX64_BN(num: BN): BN;
    static toX64_Decimal(num: Decimal): Decimal;
    static toX64(num: Decimal): BN;
    static fromX64(num: BN): Decimal;
    static fromX64_Decimal(num: Decimal): Decimal;
    static fromX64_BN(num: BN): BN;
    static shiftRightRoundUp(n: BN): BN;
    static divRoundUp(n0: BN, n1: BN): BN;
    static subUnderflowU128(n0: BN, n1: BN): BN;
    static checkUnsignedSub(n0: BN, n1: BN): BN;
    static checkMul(n0: BN, n1: BN, limit: number): BN;
    static checkMulDivFloor(n0: BN, n1: BN, denom: BN, limit: number): BN;
    static checkMulDivCeil(n0: BN, n1: BN, denom: BN, limit: number): BN;
    static checkMulDivRound(n0: BN, n1: BN, denom: BN, limit: number): BN;
    static checkMulShiftRight(n0: BN, n1: BN, shift: number, limit: number): BN;
    static checkMulShiftRight64RoundUpIf(n0: BN, n1: BN, limit: number, roundUp: boolean): BN;
    static checkMulShiftLeft(n0: BN, n1: BN, shift: number, limit: number): BN;
    static checkDivRoundUpIf(n0: BN, n1: BN, roundUp: boolean): BN;
    static isOverflow(n: BN, bit: number): boolean;
}
