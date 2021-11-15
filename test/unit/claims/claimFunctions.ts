import { ClaimGateway, ClaimHelper } from '@project/contracts/typechain';
import chai from 'chai';
import { deployments } from 'hardhat';

import { getContract } from '../utils/deployments';

const { expect } = chai;

describe('Claim Gateway Functions Check', () => {
  let claimGateway: ClaimGateway;
  let claimHelper: ClaimHelper;
  const MUMBAI_DAI_PRICE_FEED = '0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046';
  const MUMBAI_USDC_PRICE_FEED = '0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0';
  const MUMBAI_USDT_PRICE_FEED = '0x92C09849638959196E976289418e5973CC96d645';

  before(async () => {
    // NOTE : Using forking from MUMBAI Block : 17206464
    await deployments.fixture(['Config', 'Encode'], {
      keepExistingDeployments: true,
    });
    claimGateway = await getContract<ClaimGateway>('ClaimGateway');
    claimHelper = await getContract<ClaimHelper>('ClaimHelper');
  });

  it('Check Get Median Function DAI Price Feed', async () => {
    // Params
    const roundId = '18446744073709555636';

    // Call contract
    const getMedianResult = await claimHelper.getMedian(
      MUMBAI_DAI_PRICE_FEED,
      roundId
    );
    const checkClaimForDevaluation = await claimHelper.checkClaimForDevaluation(
      MUMBAI_DAI_PRICE_FEED,
      roundId
    );

    // Validate
    const assetPrice = 100118429;
    const decimals = 8;
    expect(getMedianResult[0]).to.eq(assetPrice);
    expect(getMedianResult[1]).to.eq(decimals);
    expect(checkClaimForDevaluation.assetPrice).to.eq(assetPrice);
    expect(checkClaimForDevaluation.decimals).to.eq(decimals);
  });

  it('Check Get Median Function USDC Price Feed', async () => {
    // Params
    const roundId = '18446744073709554375';

    // Call contract
    const getMedianResult = await claimHelper.getMedian(
      MUMBAI_USDC_PRICE_FEED,
      roundId
    );
    const checkClaimForDevaluation = await claimHelper.checkClaimForDevaluation(
      MUMBAI_USDC_PRICE_FEED,
      roundId
    );

    // Validate
    const assetPrice = 99956526;
    const decimals = 8;
    expect(getMedianResult[0]).to.eq(assetPrice);
    expect(getMedianResult[1]).to.eq(decimals);
    expect(checkClaimForDevaluation.assetPrice).to.eq(assetPrice);
    expect(checkClaimForDevaluation.decimals).to.eq(decimals);
  });

  it('Check Get Median Function USDT Price Feed', async () => {
    // Params
    const roundId = '18446744073709554022';

    // Call contract
    const getMedianResult = await claimHelper.getMedian(
      MUMBAI_USDT_PRICE_FEED,
      roundId
    );
    const checkClaimForDevaluation = await claimHelper.checkClaimForDevaluation(
      MUMBAI_USDT_PRICE_FEED,
      roundId
    );

    // Validate
    const assetPrice = 99634136;
    const decimals = 8;
    expect(getMedianResult[0]).to.eq(assetPrice);
    expect(getMedianResult[1]).to.eq(decimals);
    expect(checkClaimForDevaluation.assetPrice).to.eq(assetPrice);
    expect(checkClaimForDevaluation.decimals).to.eq(decimals);
  });
});
