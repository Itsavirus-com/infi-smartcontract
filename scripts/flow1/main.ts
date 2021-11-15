import { BigNumber } from '@ethersproject/bignumber';
import {
  ClaimGateway,
  CollectiveClaimGateway,
  CoverGateway,
  DaiToken,
  Encode,
  InfiToken,
  ListingData,
  Pool,
  UChildDAI,
} from '@project/contracts/typechain';
import { deployments, ethers, network } from 'hardhat';

import {
  calculateDayInUnix,
  calculatePremium,
} from '../../test/unit/utils/calculationUtils';
import {
  CURRENCY_TYPE,
  EMPTY_PERMIT_BYTES,
  INSURED_RULE,
  LISTING_TYPE,
} from '../../test/unit/utils/constants';
import { createCoverOffer } from '../../test/unit/utils/createOfferUtils';
import {
  BuyCover,
  CoverOffer,
  CoverRequest,
  DAIPermit,
  ProvideCover,
  RequestData,
  SignerWithAddress,
} from '../../test/unit/utils/interfaces';
import { encodeParam, encodePermit } from '../../test/unit/utils/paramUtils';
import {
  signCoinPricingInfo,
  signPermitDai,
  signPermitUSDC,
} from '../../test/unit/utils/signTypedDataUtils';
import {
  coverOfferData,
  dataCoinInfi,
  dataCoinUNItoDAI,
  dataCoinUNItoUSDT,
  dataCoinUSDT,
} from '../../test/unit/utils/template';
import {
  createRequestCoverWithDAI,
  getContract,
  ProvideCoverData,
  provideCoverWithDAI,
  RequestCoverData,
} from '../utils/helper';

// Get Nonce Dai
const getNonceDAI = async (address: string): Promise<BigNumber> => {
  const daiToken = await getContract<DaiToken | UChildDAI>('DAI');
  return (daiToken as UChildDAI).getNonce
    ? (daiToken as UChildDAI).getNonce(address)
    : (daiToken as DaiToken).nonces(address);
};

async function main() {
  const daiToken = await getContract<DaiToken | UChildDAI>('DAI');
  const infiToken = await getContract<InfiToken>('INFI');
  const pl = await getContract<Pool>('Pool');
  const encode = await getContract<Encode>('Encode');
  const coverGateway = await getContract<CoverGateway>('CoverGateway');
  const claimGateway = await getContract<ClaimGateway>('ClaimGateway');
  const listingData = await getContract<ListingData>('ListingData');
  const collectiveClaimGateway = await getContract<CollectiveClaimGateway>(
    'CollectiveClaimGateway'
  );
  const daiDecimal = await daiToken.decimals();

  const {
    coinSigner,
    holder1,
    holder2,
    funder1,
    funder2,
    devWallet,
  } = await ethers.getNamedSigners();

  console.log('INFI', await infiToken.address);
  console.log('Holder token :: ', await infiToken.balanceOf(holder1.address));
  console.log('Funder 1 token :: ', await infiToken.balanceOf(funder1.address));
  console.log('Funder 2 token :: ', await infiToken.balanceOf(funder2.address));

  console.log('DAI', await daiToken.address);
  console.log('Holder token :: ', await daiToken.balanceOf(holder1.address));
  console.log('Funder 1 token :: ', await daiToken.balanceOf(funder1.address));
  console.log('Funder 2 token :: ', await daiToken.balanceOf(funder2.address));

  console.log('SCENARIO 1');
  // /**
  //  * Scenario 1
  //  * - Holder 1 Create Request
  //  * - Funder 1 Provide Request
  //  * - Funder 2 Provide Request
  //  * - Holder 1 Make Claim
  //  * - Time Travel to make sure pass monitoring time
  //  * - Holder 1 Make Payout
  //  * - Funder 1 take back deposit
  //  * - Funder 2 take back collectively
  //  */

  // Holder 1 Create Request
  console.log('- Holder 1 Create Request');
  const requestId1 = 0;
  const coverRequestTemplate: RequestCoverData = {
    insuredSum: ethers.utils.parseUnits('0'),
    premiumSum: ethers.utils.parseUnits('0'),
    coverMonths: 0,
    daiToken,
    holder: holder1,
    pool: pl,
    encode,
    coinSigner,
    infiToken,
  };
  await createRequestCoverWithDAI({
    ...coverRequestTemplate,
    insuredSum: ethers.utils.parseUnits('1729', daiDecimal),
    premiumSum: ethers.utils.parseUnits('249.9999979', daiDecimal),
    coverMonths: 3,
  });

  // Take Request
  const takeRequestData: ProvideCoverData = {
    requestCoverId: 0,
    funder: funder1,
    fundingSum: ethers.utils.parseUnits('0'),
    daiToken,
    coinSigner,
    pool: pl,
    encode,
    coverGateway,
  };
  // First Take Request for 1st Request Cover
  console.log('- First Take Request for 1st Request Cover');
  const coverId1 = 0;
  await provideCoverWithDAI({
    ...takeRequestData,
    requestCoverId: 0,
    funder: funder1,
    fundingSum: ethers.utils.parseUnits('100', daiDecimal),
  });
  // Second Take Request for 1st Request Cover
  console.log('- Second Take Request for 1st Request Cover');
  const coverId2 = 1;
  await provideCoverWithDAI({
    ...takeRequestData,
    requestCoverId: 0,
    funder: funder2,
    fundingSum: ethers.utils.parseUnits('1627', daiDecimal),
  });
  // Claim Premium by funder 1
  console.log('- Funder 1 collect premium');
  await claimGateway.connect(funder1).collectPremiumOfRequestByFunder(coverId1);
  // Claim Premium Collectively by funder 2
  console.log('- Funder 2 collect premium collectively');
  await collectiveClaimGateway.connect(funder2).collectivePremiumForFunder();
  // Holder 1 Make Claim
  console.log('- Holder 1 Make Claim');
  const collectiveClaimId1 = 0;
  const claimid1 = 0;
  const claimid2 = 1;
  await collectiveClaimGateway
    .connect(holder1)
    .collectiveSubmitClaim(requestId1, '18446744073709555936');

  // Jump to end 72 hour to make sure pass monitoring time
  console.log('- Jump to end 72 hour to make sure pass monitoring time');
  const currentBlockTimestamp = (await ethers.provider.getBlock('latest'))
    .timestamp;
  const expiredAt = currentBlockTimestamp + calculateDayInUnix(4);
  await network.provider.send('evm_setNextBlockTimestamp', [expiredAt]);

  // Holder 1 Make Payout
  console.log('- Holder 1 Make Payout');
  await collectiveClaimGateway.connect(holder1).checkPayout(collectiveClaimId1);

  // Time travel passing expired date
  console.log('- Time travel passing expired date');
  const expiredDate = parseInt(
    (await coverGateway.getEndAt(coverId1)).toString(),
    0
  );
  await network.provider.send('evm_setNextBlockTimestamp', [expiredDate + 60]);

  // Funder 1 take back deposit
  console.log('- Funder 1 take back deposit');
  await claimGateway.connect(funder1).refundDepositOfProvideCover(coverId1);

  // Funder 2 take back collectively
  console.log('- Funder 2 take back collectively');
  await collectiveClaimGateway
    .connect(funder2)
    .collectiveRefundDepositOfProvideRequest();

  console.log('SCENARIO 2');
  /**
   * Scenario 2
   * - Funder Create Offer Cover - 1st
   * - Funder Create Offer Cover - 2nd
   * - Holder 1 Buy Cover - 1st
   * - Holder 2 Buy Cover - 2nd
   * - Holder 1 Make Claim
   * - Holder 2 Make Claim, No Payout
   * - Time travel to end of payout period
   * - Validate Pending Claims
   * - Funder Collectively Take Back Deposit
   * - Payout Dev Wallet
   */

  // Funder Create Offer Cover - 1st
  console.log('- Funder Create Offer Cover - 1st');
  const currentTimestampForOffer1 = (await ethers.provider.getBlock('latest'))
    .timestamp;
  const offerId1 = 0;
  const offerData1: CoverOffer = {
    ...coverOfferData,
    funder: funder1.address,
    insuredSum: ethers.utils.parseUnits('5000', daiDecimal),
    insuredSumCurrency: CURRENCY_TYPE.DAI,
    premiumCostPerMonth: ethers.utils.parseUnits('0.5', daiDecimal),
    premiumCurrency: CURRENCY_TYPE.DAI,
    insuredSumRule: INSURED_RULE.PARTIAL,
    expiredAt: currentTimestampForOffer1 + calculateDayInUnix(12 * 30),
  };
  await createCoverOffer(offerData1, funder1);

  // Funder Create Offer Cover - 2st
  console.log('- Funder Create Offer Cover - 2st');
  const currentTimestampForOffer2 = (await ethers.provider.getBlock('latest'))
    .timestamp;
  const offerId2 = 1;
  const offerData2: CoverOffer = {
    ...coverOfferData,
    funder: funder1.address,
    insuredSum: ethers.utils.parseUnits('5000', daiDecimal),
    insuredSumCurrency: CURRENCY_TYPE.DAI,
    premiumCostPerMonth: ethers.utils.parseUnits('0.5', daiDecimal),
    premiumCurrency: CURRENCY_TYPE.DAI,
    insuredSumRule: INSURED_RULE.PARTIAL,
    expiredAt: currentTimestampForOffer2 + calculateDayInUnix(12 * 30),
  };
  await createCoverOffer(offerData2, funder1);

  // Holder 1 Buy Cover - 1st
  console.log('- Holder 1 Buy Cover - 1st');
  const coverId3 = 2;
  const blockNow = (await ethers.provider.getBlock('latest')).timestamp;
  const buyCoverData1 = {
    insuredSumInUnit: ethers.utils.parseUnits('1000', daiDecimal),
    coverQtyInUnit: ethers.utils
      .parseUnits('1000', daiDecimal)
      .mul(ethers.utils.parseUnits('1', 6)) // Need to times to 1e6 because will divider by 1e6
      .div(dataCoinUNItoUSDT.coinPrice),
    permitDataBytes: encodePermit(
      CURRENCY_TYPE.DAI,
      await signPermitDai(
        holder1,
        pl.address,
        (await getNonceDAI(holder1.address)).toNumber(),
        blockNow + calculateDayInUnix(1)
      ),
      encode
    ),
  };
  const dataBuyCover1: BuyCover = {
    offerId: ethers.BigNumber.from(offerId1),
    buyer: holder1.address,
    coverMonths: 1,
    coverQty: buyCoverData1.coverQtyInUnit,
    insuredSum: buyCoverData1.insuredSumInUnit,
    assetPricing: await signCoinPricingInfo(
      dataCoinUNItoDAI,
      coinSigner,
      pl.address // verify by Cover Gateway Contract
    ),
    premiumPermit: buyCoverData1.permitDataBytes,
  };
  await coverGateway.connect(holder1).buyCover(dataBuyCover1);

  // Holder 2 Buy Cover - 2nd
  console.log('- Holder 2 Buy Cover - 2nd');
  const coverId4 = 3;
  const currentBlock = (await ethers.provider.getBlock('latest')).timestamp;
  const buyCoverData2 = {
    insuredSumInUnit: ethers.utils.parseUnits('1000', daiDecimal),
    coverQtyInUnit: ethers.utils
      .parseUnits('1000', daiDecimal)
      .mul(ethers.utils.parseUnits('1', 6)) // Need to times to 1e6 because will divider by 1e6
      .div(dataCoinUNItoUSDT.coinPrice),
    permitDataBytes: encodePermit(
      CURRENCY_TYPE.DAI,
      await signPermitDai(
        holder2,
        pl.address,
        (await getNonceDAI(holder2.address)).toNumber(),
        currentBlock + calculateDayInUnix(1)
      ),
      encode
    ),
  };
  const dataBuyCover2: BuyCover = {
    offerId: ethers.BigNumber.from(offerId2),
    buyer: holder2.address,
    coverMonths: 1,
    coverQty: buyCoverData2.coverQtyInUnit,
    insuredSum: buyCoverData2.insuredSumInUnit,
    assetPricing: await signCoinPricingInfo(
      dataCoinUNItoDAI,
      coinSigner,
      pl.address // verify by Cover Gateway Contract
    ),
    premiumPermit: buyCoverData2.permitDataBytes,
  };
  await coverGateway.connect(holder2).buyCover(dataBuyCover2);

  // Holder 1 Make Claim , get payout
  console.log('- Holder 1 Make Claim , get payout');
  const claimId3 = 2;
  await claimGateway
    .connect(holder1)
    .submitClaim(coverId3, '18446744073709555607');

  // Holder 2 Make Claim, No Payout
  console.log('- Holder 2 Make Claim, No Payout');
  const claimId4 = 3;
  await claimGateway
    .connect(holder2)
    .submitClaim(coverId4, '18446744073709555936');

  // Time travel to end of offer period
  console.log('- Time travel to end of offer period');
  const expiredOffer1 = parseInt(
    (await listingData.getCoverOfferById(offerId1)).expiredAt.toString(),
    0
  );
  await network.provider.send('evm_setNextBlockTimestamp', [
    expiredOffer1 + 3600,
  ]);
  await network.provider.send('evm_mine');

  // Validate Pending Claims
  console.log('- Validate Pending Claims');
  await claimGateway.validateAllPendingClaims(
    LISTING_TYPE.OFFER,
    funder1.address
  );

  // Funder Collectively Take Back Deposit
  console.log('- Funder Collectively Take Back Deposit');
  await collectiveClaimGateway
    .connect(funder1)
    .collectiveRefundDepositOfCoverOffer();

  // Payout Dev Wallet
  console.log('- Payout Dev Wallet');
  await claimGateway.connect(devWallet).withdrawExpiredPayout();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
