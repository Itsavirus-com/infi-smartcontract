import { isHexString } from '@ethersproject/bytes';
import { ethers as ethersjs } from 'ethers';
import { ethers, network } from 'hardhat';

export function checkEventExists(
  nameOrSignatureOrTopic: string,
  iface: ethersjs.utils.Interface
): boolean {
  if (isHexString(nameOrSignatureOrTopic)) {
    const topichash = nameOrSignatureOrTopic.toLowerCase();
    for (const name in iface.events) {
      if (topichash === iface.getEventTopic(name)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

describe('Parsing', () => {
  xit('Parsing Logs', async () => {
    const txhash =
      '0x92dd3b00e6da5231590fe652f3d0e4ea2a6caff4160c4057b3dfebf0e8d259fb';
    const transactionReceipt: ethersjs.providers.TransactionReceipt = await ethers.provider.getTransactionReceipt(
      // parameter is transaction hash that coming from
      txhash
    );
    // ABI of events
    const abi: string[] = [
      'event TokensReceived(address indexed,address indexed,uint256,bytes)',
      'event CreateRequest(uint256,indexed address,(uint256,uint8,uint256,uint256,uint8,uint256,uint8,uint256,string,(uint8,uint256[]),uint8,address),(string,string,uint256,uint256,uint8,bytes32,bytes32),(string,string,uint256,uint256,uint8,bytes32,bytes32))',
      'event CreateOffer(uint256,indexed address,(uint8,uint256,uint8,uint256,uint8,uint256,string,(uint8,uint256[]),uint8,address),(string,string,uint256,uint256,uint8,bytes32,bytes32),(string,string,uint256,uint256,uint8,bytes32,bytes32),uint8)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'event CreateOffer(uint256 id,address indexed funder,(uint8 minCoverMonths,uint256 insuredSum,uint8 insuredSumCurrency,uint256 premiumCostPerMonth,uint8 premiumCurrency,uint256 expiredAt,string coinId,(uint8 coverType,uint256[] territoryIds),uint8 insuredSumRule,address funder),(string coinId,string coinSymbol,uint256 coinPrice,uint256 lastUpdatedAt,uint8 sigV,bytes32 sigR,bytes32 sigS),(string coinId,string coinSymbol,uint256 coinPrice,uint256 lastUpdatedAt,uint8 sigV,bytes32 sigR,bytes32 sigS),uint8 depositPeriod)',
    ];
    // Make interface
    const iface: ethersjs.utils.Interface = new ethers.utils.Interface(abi);
    // Get logs of transaction
    const { logs } = transactionReceipt;

    logs.forEach((log: ethersjs.providers.Log) => {
      if (checkEventExists(log.topics[0], iface)) {
        console.log(iface.parseLog(log).name);
      } else {
        console.log('None');
      }
    });
  });
});
