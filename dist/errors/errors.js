/* eslint-disable no-shadow */
export var MathErrorCode;
(function (MathErrorCode) {
    MathErrorCode["IntegerDowncastOverflow"] = "IntegerDowncastOverflow";
    MathErrorCode["MulOverflow"] = "MultiplicationOverflow";
    MathErrorCode["MulDivOverflow"] = "MulDivOverflow";
    MathErrorCode["MulShiftRightOverflow"] = "MulShiftRightOverflow";
    MathErrorCode["MulShiftLeftOverflow"] = "MulShiftLeftOverflow";
    MathErrorCode["DivideByZero"] = "DivideByZero";
    MathErrorCode["UnsignedIntegerOverflow"] = "UnsignedIntegerOverflow";
})(MathErrorCode || (MathErrorCode = {}));
export var CoinErrorCode;
(function (CoinErrorCode) {
    CoinErrorCode["CoinAmountMaxExceeded"] = "CoinAmountMaxExceeded";
    CoinErrorCode["CoinAmountMinSubceeded"] = "CoinAmountMinSubceeded ";
    CoinErrorCode["SqrtPriceOutOfBounds"] = "SqrtPriceOutOfBounds";
})(CoinErrorCode || (CoinErrorCode = {}));
export var SwapErrorCode;
(function (SwapErrorCode) {
    SwapErrorCode["InvalidSqrtPriceLimitDirection"] = "InvalidSqrtPriceLimitDirection";
    SwapErrorCode["SqrtPriceOutOfBounds"] = "SqrtPriceOutOfBounds";
    SwapErrorCode["ZeroTradableAmount"] = "ZeroTradableAmount";
    SwapErrorCode["AmountOutBelowMinimum"] = "AmountOutBelowMinimum";
    SwapErrorCode["AmountInAboveMaximum"] = "AmountInAboveMaximum";
    SwapErrorCode["NextTickNotFound"] = "NextTickNoutFound";
    SwapErrorCode["TickArraySequenceInvalid"] = "TickArraySequenceInvalid";
    SwapErrorCode["TickArrayCrossingAboveMax"] = "TickArrayCrossingAboveMax";
    SwapErrorCode["TickArrayIndexNotInitialized"] = "TickArrayIndexNotInitialized";
})(SwapErrorCode || (SwapErrorCode = {}));
export var PoolErrorCode;
(function (PoolErrorCode) {
    PoolErrorCode["InvalidCoinTypeSequence"] = "InvalidCoinTypeSequence";
})(PoolErrorCode || (PoolErrorCode = {}));
export class ClmmpoolsError extends Error {
    constructor(message, errorCode) {
        super(message);
        this.message = message;
        this.errorCode = errorCode;
    }
    static isClmmpoolsErrorCode(e, code) {
        return e instanceof ClmmpoolsError && e.errorCode === code;
    }
}
