// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1363Receiver} from "../ERC/IERC1363Receiver.sol";
import {Master} from "../Master/Master.sol";
import {ListingGateway} from "../Gateway/ListingGateway.sol";
import {PlatformData} from "../Data/PlatformData.sol";
import {IDaiPermit} from "../ERC/IDaiPermit.sol";
import {EIP712} from "../EIP/EIP712.sol";

contract Pool is IERC1363Receiver, Master {
    using SafeERC20 for ERC20;

    // State Variables
    ListingGateway private lg;
    PlatformData private platformData;
    ERC20Burnable internal infiToken;
    address public devWallet;
    address public daiTokenAddr;
    address public usdtTokenAddr;
    address public usdcTokenAddr;
    bytes32 public DOMAIN_SEPARATOR;

    // Constants
    bytes4 internal constant _INTERFACE_ID_ERC1363_RECEIVER = 0x88a7ca5c;
    bytes32 private constant COIN_TYPE_HASH =
        keccak256(
            "CoinPricingInfo(string coinId,string coinSymbol,uint256 coinPrice,uint256 lastUpdatedAt)"
        );
    bytes32 private constant CREATE_COVER_REQUEST =
        keccak256("CREATE_COVER_REQUEST");
    bytes32 private constant CREATE_COVER_OFFER =
        keccak256("CREATE_COVER_OFFER");

    // Event
    event TokensReceived(
        address indexed operator,
        address indexed from,
        uint256 value,
        bytes data
    );

    constructor() {
        DOMAIN_SEPARATOR = EIP712.makeDomainSeparator("insured-finance", "v1");
    }

    function changeDependentContractAddress() external {
        // Only admin allowed to call this function
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );
        infiToken = ERC20Burnable(cg.infiTokenAddr());
        lg = ListingGateway(cg.getLatestAddress("LG"));
        devWallet = cg.getLatestAddress("DW");
        daiTokenAddr = cg.getLatestAddress("DT");
        usdtTokenAddr = cg.getLatestAddress("UT");
        usdcTokenAddr = cg.getLatestAddress("UC");
        platformData = PlatformData(cg.getLatestAddress("PD"));
    }

    /**
     * @dev function only able to call by InfiToken Smart Contract when user create Cover Request & Cover Offer
     * read : https://github.com/vittominacori/erc1363-payable-token/blob/master/contracts/token/ERC1363/IERC1363Receiver.sol
     */
    function onTransferReceived(
        address operator,
        address from,
        uint256 value,
        bytes memory data
    ) external override returns (bytes4) {
        require(msg.sender == address(infiToken), "ERR_AUTH_2"); // Only specific token accepted (on this case only INFI)

        // Emit Event
        emit TokensReceived(operator, from, value, data);

        // Decode bytes data
        (bytes32 payType, bytes memory payData) = abi.decode(
            data,
            (bytes32, bytes)
        );

        if (payType == CREATE_COVER_REQUEST) {
            lg.createCoverRequest(from, value, payData);
        } else if (payType == CREATE_COVER_OFFER) {
            lg.createCoverOffer(from, value, payData);
        } else {
            revert("ERC1363Receiver: INVALID_PAY_TYPE");
        }

        return _INTERFACE_ID_ERC1363_RECEIVER;
    }

    /**
     * @dev Burn half of listing fee & transfer half of listing fee to developer wallet
     */
    function transferAndBurnInfi(uint256 listingFee) external onlyInternal {
        // Calculation half of listing fee
        uint256 halfListingFee = listingFee / 2;
        infiToken.burn(halfListingFee); // burn half of listing fee
        if (listingFee % 2 == 1) {
            require(
                infiToken.transfer(devWallet, (halfListingFee + 1)),
                "Infi : transfer failed"
            ); // transfer to dev wallet + 1
        } else {
            require(
                infiToken.transfer(devWallet, halfListingFee),
                "Infi : transfer failed"
            ); // transfer to dev wallet
        }
    }

    /**
     * @dev Calculate listing fee (in infi token)
     * NOTE : This one need to take price from chainlink
     */
    function getListingFee(
        CurrencyType insuredSumCurrency,
        uint256 insuredSum,
        uint256 feeCoinPrice,
        uint80 roundId
    ) external view returns (uint256) {
        uint256 feeCoinPriceDecimal = 6;
        // uint insuredSumInUSD = insuredSum * insuredSumCurrencyPriceOnCL / 10**insuredSumCurrencyDecimalOnCL / 10**insuredSumCurrencyDecimal; // insuredSum in USD
        // uint insuredSumInInfi = insuredSumInUSD * 10**feeCoinPriceDecimal / feeCoinPrice;
        // uint listingFeeInInfi = insuredSumInInfi / 100;  // 1% of insured sum
        // 100_000_000 * 10_000 * 1_000_000 * 10**18 / 100_000 / 100 / 10_000 / 1_000_000

        uint256 insuredSumCurrencyDecimal = cg.getCurrencyDecimal(
            uint8(insuredSumCurrency)
        );

        // Get price on chainlink
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            platformData.getOraclePriceFeedAddress(
                cg.getCurrencyName(uint8(insuredSumCurrency))
            )
        );
        (, int256 insuredSumCurrencyPriceOnCL, , , ) = priceFeed.getRoundData(
            roundId
        );

        return
            (insuredSum *
                uint256(insuredSumCurrencyPriceOnCL) *
                10**feeCoinPriceDecimal *
                10**infiToken.decimals()) /
            feeCoinPrice /
            100 /
            10**priceFeed.decimals() /
            10**insuredSumCurrencyDecimal;
    }

    /**
     * @dev Used for transfer token from External Account to this smart contract
     * Called on Create Request, Create Offer, Take Request & Take Offer
     * Only accept DAI, USDT & USDC
     */
    function acceptAsset(
        address from,
        CurrencyType currentyType,
        uint256 amount,
        bytes memory premiumPermit
    ) external onlyInternal {
        if (currentyType == CurrencyType.DAI) {
            // Approve
            DAIPermit memory permitData = abi.decode(
                premiumPermit,
                (DAIPermit)
            );
            IDaiPermit(daiTokenAddr).permit(
                permitData.holder,
                permitData.spender,
                permitData.nonce,
                permitData.expiry,
                permitData.allowed,
                permitData.sigV,
                permitData.sigR,
                permitData.sigS
            );
            // Transfer from member to smart contract
            require(
                IDaiPermit(daiTokenAddr).transferFrom(
                    from,
                    address(this),
                    amount
                ),
                "DAI : accept asset failed"
            );
        } else if (currentyType == CurrencyType.USDT) {
            ERC20(usdtTokenAddr).safeTransferFrom(from, address(this), amount);
        } else if (currentyType == CurrencyType.USDC) {
            // Approve
            EIP2612Permit memory permitData = abi.decode(
                premiumPermit,
                (EIP2612Permit)
            );
            IERC20Permit(usdcTokenAddr).permit(
                permitData.owner,
                permitData.spender,
                permitData.value,
                permitData.deadline,
                permitData.sigV,
                permitData.sigR,
                permitData.sigS
            );
            // Transfer from member to smart contract
            require(
                IERC20(usdcTokenAddr).transferFrom(from, address(this), amount),
                "USDC : accept asset failed"
            );
        }
    }

    /**
     * @dev Used for transfer token from this smart contract to External Account
     * Called on Send Premium to Funder, Claim & Refund
     * Only able to send DAI, USDT & USDC
     */
    function transferAsset(
        address to,
        CurrencyType currentyType,
        uint256 amount
    ) external onlyInternal {
        if (currentyType == CurrencyType.DAI) {
            require(
                IERC20(daiTokenAddr).transfer(to, amount),
                "DAI : transfer failed"
            );
        } else if (currentyType == CurrencyType.USDT) {
            ERC20(usdtTokenAddr).safeTransfer(to, amount);
        } else if (currentyType == CurrencyType.USDC) {
            require(
                IERC20(usdcTokenAddr).transfer(to, amount),
                "USDC : transfer failed"
            );
        }
    }

    /**
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     */
    function verifyMessage(CoinPricingInfo memory coinPricing, address whose)
        external
        view
    {
        require(
            EIP712.recover(
                DOMAIN_SEPARATOR,
                coinPricing.sigV,
                coinPricing.sigR,
                coinPricing.sigS,
                hash(coinPricing)
            ) == whose,
            "ERR_SIGN_NOT_VALID"
        );
    }

    function hash(CoinPricingInfo memory coinPricing)
        internal
        pure
        returns (bytes memory)
    {
        return
            abi.encode(
                COIN_TYPE_HASH,
                keccak256(bytes(coinPricing.coinId)),
                keccak256(bytes(coinPricing.coinSymbol)),
                coinPricing.coinPrice,
                coinPricing.lastUpdatedAt
            );
    }
}
