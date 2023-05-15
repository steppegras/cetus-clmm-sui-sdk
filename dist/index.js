(()=>{"use strict";var e={n:n=>{var i=n&&n.__esModule?()=>n.default:()=>n;return e.d(i,{a:i}),i},d:(n,i)=>{for(var o in i)e.o(i,o)&&!e.o(n,o)&&Object.defineProperty(n,o,{enumerable:!0,get:i[o]})},o:(e,n)=>Object.prototype.hasOwnProperty.call(e,n)};require("@mysten/sui.js");const n=require("bn.js");var i=e.n(n);require("@mysten/bcs");const o=require("decimal.js");var r,t,u,a,s,c,d=e.n(o);new(i())(1e6),d().config({precision:64,rounding:d().ROUND_DOWN,toExpNeg:-64,toExpPos:64}),(c=r||(r={})).IntegerDowncastOverflow="IntegerDowncastOverflow",c.MulOverflow="MultiplicationOverflow",c.MulDivOverflow="MulDivOverflow",c.MulShiftRightOverflow="MulShiftRightOverflow",c.MulShiftLeftOverflow="MulShiftLeftOverflow",c.DivideByZero="DivideByZero",c.UnsignedIntegerOverflow="UnsignedIntegerOverflow",(s=t||(t={})).CoinAmountMaxExceeded="CoinAmountMaxExceeded",s.CoinAmountMinSubceeded="CoinAmountMinSubceeded ",s.SqrtPriceOutOfBounds="SqrtPriceOutOfBounds",function(e){e.InvalidSqrtPriceLimitDirection="InvalidSqrtPriceLimitDirection",e.SqrtPriceOutOfBounds="SqrtPriceOutOfBounds",e.ZeroTradableAmount="ZeroTradableAmount",e.AmountOutBelowMinimum="AmountOutBelowMinimum",e.AmountInAboveMaximum="AmountInAboveMaximum",e.NextTickNotFound="NextTickNoutFound",e.TickArraySequenceInvalid="TickArraySequenceInvalid",e.TickArrayCrossingAboveMax="TickArrayCrossingAboveMax",e.TickArrayIndexNotInitialized="TickArrayIndexNotInitialized"}(u||(u={})),function(e){e.InvalidCoinTypeSequence="InvalidCoinTypeSequence"}(a||(a={}));class l extends Error{message;errorCode;constructor(e,n){super(e),this.message=e,this.errorCode=n}static isClmmpoolsErrorCode(e,n){return e instanceof l&&e.errorCode===n}}new(i())(0);const v=new(i())(1),f=new(i())(2);var w,m,O,g,E,I,p,A,T,b;f.pow(new(i())(128)),f.pow(new(i())(64)).sub(v),f.pow(new(i())(128)).sub(v),new(i())(365),new(i())(24),new(i())(3600),new(i())(.5),(I=w||(w={})).A2B="a2b",I.B2A="b2a",function(e){e.Input="Specified input amount",e.Output="Specified output amount"}(m||(m={})),(E=O||(O={}))[E.BelowRange=0]="BelowRange",E[E.InRange=1]="InRange",E[E.AboveRange=2]="AboveRange",(p=g||(g={}))[p.FIVE=5]="FIVE",p[p.TEN=10]="TEN",p[p.TWENTY=20]="TWENTY",p[p.TWENTY_FIVE=25]="TWENTY_FIVE",p[p.FIVETY=50]="FIVETY",p[p.HUNDRED=100]="HUNDRED",function(e){e.Deleted="Deleted",e.Exists="Exists",e.NotExists="NotExists"}(A||(A={})),(b=T||(T={})).Upcoming="Upcoming",b.Live="Live",b.Settle="Settle",b.Ended="Ended",b.Failed="Failed",b.Canceled="Canceled",require("@syntsugar/cc-graph"),require("js-base64")})();
//# sourceMappingURL=index.js.map