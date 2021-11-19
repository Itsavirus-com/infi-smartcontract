import {
  ListingData,
  ListingDataDummyImplementation,
  UUPSProxy,
} from '@project/contracts/typechain';
import chai from 'chai';
import { deployments, ethers } from 'hardhat';
import { DeployResult } from 'hardhat-deploy/types';

import { coverOfferData, CURRENCY_TYPE } from '../utils/constants';
import { createCoverOffer } from '../utils/createOfferUtils';
import { CoverOffer, SignerWithAddress } from '../utils/interfaces';

const { expect } = chai;

describe('Listing Data Proxy', async () => {
  let proxyAdmin: SignerWithAddress;
  let wrongAdmin: SignerWithAddress;
  let listingDataImpl: ListingData;
  let listingDataProxy: UUPSProxy;
  let newListingDataImpl: DeployResult;
  let funder1: SignerWithAddress;
  let offerData: CoverOffer;
  const args: any[] = [];

  before(async () => {
    await deployments.fixture(['Config'], {
      keepExistingDeployments: true,
    });

    ({
      deployer: proxyAdmin,
      test: wrongAdmin,
      funder1,
    } = await ethers.getNamedSigners());
    listingDataImpl = await ethers.getContract<ListingData>('ListingData');
    listingDataProxy = await ethers.getContract<UUPSProxy>('ListingData');
    newListingDataImpl = await deployments.deploy(
      'ListingDataDummyImplementation',
      {
        from: proxyAdmin.address,
        args,
        log: true,
      }
    );

    wrongAdmin = await ethers.getNamedSigner('test');

    offerData = {
      ...coverOfferData,
      funder: funder1.address,
      premiumCurrency: CURRENCY_TYPE.DAI,
    };

    await createCoverOffer(offerData, funder1);
  });

  describe('Upgrade contract', async () => {
    it('Should fail upgrade when actor is not admin', async () => {
      await expect(
        listingDataImpl
          .connect(wrongAdmin)
          .upgradeTo(newListingDataImpl.address)
      ).to.be.revertedWith('ERR_AUTH_5');
    });

    it('Should success upgrade when actor is admin', async () => {
      await listingDataImpl
        .connect(proxyAdmin)
        .upgradeTo(newListingDataImpl.address);

      expect(await listingDataProxy.getImplementation()).to.eq(
        newListingDataImpl.address
      );
    });

    it('Should keep storage data same as before upgrading the implementation', async () => {
      const storedData = await listingDataImpl.getCoverOfferById(0);

      expect(storedData.insuredSum).to.eq(offerData.insuredSum);
      expect(storedData.coinId).to.eq(offerData.coinId);
      expect(storedData.insuredSumCurrency).to.eq(offerData.insuredSumCurrency);
      expect(storedData.coverLimit.coverType).to.eq(
        offerData.coverLimit.coverType
      );
      expect(storedData.coverLimit.territoryIds).to.have.lengthOf(
        offerData.coverLimit.territoryIds.length
      );
    });
  });
});
