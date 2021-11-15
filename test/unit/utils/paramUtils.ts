import { DaiPermit } from "@project/contracts/src/types";
import { Encode } from '@project/contracts/typechain';
import { ethers } from 'hardhat';

import { CURRENCY_TYPE,PAY_TYPE } from './constants';
import { CreateCoverOfferData, CreateCoverRequestData, DAIPermit,EIP2612Permit } from './interfaces';

/*
 * This function for generate parameter input (Struct for Listing) to bytes
 */
export function encodeParam(
  payType: typeof PAY_TYPE.CREATE_COVER_REQUEST,
  payData: CreateCoverRequestData,
  encode: Encode
): string;

export function encodeParam(
  payType: typeof PAY_TYPE.CREATE_COVER_OFFER,
  payData: CreateCoverOfferData,
  encode: Encode
): string;

export function encodeParam(
  payType: string,
  payData: unknown,
  encode: Encode
): string {
  let payDataBytes: string;

  if (payType === PAY_TYPE.CREATE_COVER_REQUEST) {
    // Payload Request
    payDataBytes = ethers.utils.hexDataSlice(
      encode.interface.encodeFunctionData('encodeCreateCoverRequestData', [
        payData as CreateCoverRequestData,
      ]),
      4
    );
  } else if (payType === PAY_TYPE.CREATE_COVER_OFFER) {
    payDataBytes = ethers.utils.hexDataSlice(
      encode.interface.encodeFunctionData('encodeCreateCoverOfferData', [
        payData as CreateCoverOfferData,
      ]),
      4
    );
  } else {
    throw new Error('Invalid payType');
  }

  return ethers.utils.defaultAbiCoder.encode(
    ['bytes32', 'bytes'],
    [payType, payDataBytes]
  );
}

export function encodePermit(
  currencyType: number,
  permitData : unknown,
  encode: Encode
): string {
  let payDataBytes: string;

  if (currencyType === CURRENCY_TYPE.USDC) {
    // Payload Request
    payDataBytes = ethers.utils.hexDataSlice(
      encode.interface.encodeFunctionData('encodeEIP2612Permit', [
        permitData as EIP2612Permit,
      ]),
      4
    );
  } else if (currencyType === CURRENCY_TYPE.DAI) {
    payDataBytes = ethers.utils.hexDataSlice(
      encode.interface.encodeFunctionData('encodeDAIPermit', [
        permitData as DAIPermit,
      ]),
      4
    );
  } else {
    throw new Error('Invalid payType');
  }

  return payDataBytes;
}
