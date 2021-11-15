import { Encode } from '@project/contracts/typechain';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

// See: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html#recursive-conditional-types
export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
export type AwaitedDeep<T> = T extends PromiseLike<infer U>
  ? AwaitedDeep<U>
  : T;
export type ElementType<T> = T extends ReadonlyArray<infer U> ? U : T;
export type ElementTypeDeep<T> = T extends ReadonlyArray<infer U>
  ? ElementTypeDeep<U>
  : T;

export type SignerWithAddress = Awaited<
  ReturnType<HardhatRuntimeEnvironment['ethers']['getSigner']>
>;

export type CreateCoverRequestData = Parameters<
  Encode['encodeCreateCoverRequestData']
>[0];

export type RequestData = CreateCoverRequestData['request'];

export type CreateCoverOfferData = Parameters<
  Encode['encodeCreateCoverOfferData']
>[0];
export type OfferData = CreateCoverOfferData['offer'];

export type BuyCover = Parameters<Encode['encodeBuyCover']>[0];
export type ProvideCover = Parameters<Encode['encodeProvideCover']>[0];

export type CoverRequest = CreateCoverRequestData['request'];
export type CoverOffer = CreateCoverOfferData['offer'];
export type EIP2612Permit = Parameters<Encode['encodeEIP2612Permit']>[0];
export type DAIPermit = Parameters<Encode['encodeDAIPermit']>[0];
export type CoinPricingInfo = CreateCoverRequestData['feePricing'];

export type CoinPricingInfoUnsigned = Omit<
  CoinPricingInfo,
  'sigV' | 'sigR' | 'sigS'
>;
