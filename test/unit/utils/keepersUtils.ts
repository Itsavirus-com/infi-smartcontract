import { ClaimHelper, PlatformData } from '@project/contracts/typechain';
import { smock } from '@defi-wonderland/smock';
import { abi as EACAggregatorProxyAbi } from '@project/contracts/deployments/external/EACAggregatorProxy.json';
import { getContract } from './deployments';
import { ethers } from 'hardhat';
import { SignerWithAddress } from './interfaces';

export async function setUpMockKeepers(
  eventRoundIds: Array<string>,
  startEvent: number,
  price: {
    past?: number;
    current: number;
    next?: number;
  }
) {
  const claimHelper = await getContract<ClaimHelper>('ClaimHelper');
  const platformData = await getContract<PlatformData>('PlatformData');
  let deployer: SignerWithAddress;
  ({ deployer } = await ethers.getNamedSigners());

  // Setup Mocking Pricefeed
  const priceFeedFake = await smock.fake(EACAggregatorProxyAbi);
  priceFeedFake.decimals.returns(6);

  // Set Latest round data
  priceFeedFake.latestRoundData.returns([
    0,
    price.current,
    startEvent + 259300,
    startEvent + 259300,
    0,
  ]);
  priceFeedFake.getRoundData
    .whenCalledWith(0)
    .returns([0, price.current, startEvent + 259300, startEvent + 259300, 0]);

  for (let j = 0; j < eventRoundIds.length; j++) {
    const eventRoundId = eventRoundIds[j];
    // Set Price When Round Id Called
    priceFeedFake.getRoundData
      .whenCalledWith(eventRoundId)
      .returns([0, price.current, startEvent, startEvent, 0]);

    // Setting Round Data
    const parseRoundId = await claimHelper.parseIds(eventRoundId);
    const phaseId = parseRoundId[0];
    const originalRoundId = parseInt(parseRoundId[1].toString());

    // Only execute if price.past exists, for sake for efficiency
    if (price.past !== null) {
      // Set Previous Round Data
      for (let i = 1; i <= 100; i++) {
        let newOriginalRoungId = await claimHelper.getRoundId(
          phaseId,
          originalRoundId - i
        );
        priceFeedFake.getRoundData
          .whenCalledWith(newOriginalRoungId)
          .returns([
            0,
            price.past,
            startEvent - i * 1200,
            startEvent - i * 1200,
            0,
          ]);
      }
    }
    // Set Next Round Data
    // For the sake of efficiency, Only execute when price.future exists
    if (price.next !== null) {
      for (let i = 1; i <= 150; i++) {
        let newOriginalRoungId = await claimHelper.getRoundId(
          phaseId,
          originalRoundId + i
        );
        priceFeedFake.getRoundData
          .whenCalledWith(newOriginalRoungId)
          .returns([
            0,
            price.next,
            startEvent + i * 1800,
            startEvent + i * 1800,
            0,
          ]);
      }
    }
  }

  // Link Keepers to Contract
  await platformData
    .connect(deployer)
    .addNewPriceFeed('dai', 0, 1, 8, priceFeedFake.address);
  await platformData
    .connect(deployer)
    .addNewPriceFeed('usd-coin', 0, 1, 8, priceFeedFake.address);
  await platformData
    .connect(deployer)
    .addNewPriceFeed('tether', 0, 1, 8, priceFeedFake.address);
}
