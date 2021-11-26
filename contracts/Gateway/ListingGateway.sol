// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IListingData} from "../Interfaces/IListingData.sol";
import {IClaimData} from "../Interfaces/IClaimData.sol";
import {IListingGateway} from "../Interfaces/IListingGateway.sol";
import {IPlatformData} from "../Interfaces/IPlatformData.sol";
import {ICoverGateway} from "../Interfaces/ICoverGateway.sol";
import {ICoverData} from "../Interfaces/ICoverData.sol";
import {IPool} from "../Interfaces/IPool.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

contract ListingGateway is IListingGateway, Pausable {
    ICoverData public cd;
    IListingData public ld;
    IClaimData public claimData;
    ICoverGateway public coverGateway;
    IPool public pool;
    IPlatformData public platformData;
    ERC20Burnable public infiToken;
    address public coinSigner;

    /**
    @dev Check balance of member/sender, minimal have 5000 Infi token. Used in Create Offer, Take Offer and Take Request
    @param _from member/sender's address
    @param _tokenAmount amount of token that used for create listing (will be 0 for take offer and take request)
     */
    modifier minimumBalance(address _from, uint256 _tokenAmount) {
        uint256 tokenAfterTransfer = infiToken.balanceOf(_from);
        uint256 tokenBeforeTransfer = tokenAfterTransfer + _tokenAmount;
        uint256 infiTokenDecimal = 18;
        require(
            tokenBeforeTransfer >= (5000 * (10**infiTokenDecimal)),
            "ERR_AUTH_4"
        );
        _;
    }

    /**
     @dev Tier system for check capability of member
     @param _from member's address
     @param _tokenAmount amount of infi token that transfered
     @param _insuredSum value of asset in USD
     @param _currencyType insuredsum's currency
     */
    modifier verifyMemberLevel(
        address _from,
        uint256 _tokenAmount,
        uint256 _insuredSum,
        CurrencyType _currencyType
    ) {
        uint256 tokenAfterTransfer = infiToken.balanceOf(_from);
        uint256 tokenBeforeTransfer = tokenAfterTransfer + _tokenAmount;
        uint256 infiTokenDecimal = 18;
        uint256 insuredSumCurrencyDecimal = cg.getCurrencyDecimal(
            uint8(_currencyType)
        );

        if (_insuredSum <= (10000 * (10**insuredSumCurrencyDecimal))) {
            // Bronze
            require(
                tokenBeforeTransfer >= (5000 * (10**infiTokenDecimal)),
                "ERR_AUTH_4"
            );
        } else if (_insuredSum <= (50000 * (10**insuredSumCurrencyDecimal))) {
            // Silver
            require(
                tokenBeforeTransfer >= (10000 * (10**infiTokenDecimal)),
                "ERR_AUTH_4"
            );
        } else if (_insuredSum <= (100000 * (10**insuredSumCurrencyDecimal))) {
            // Gold
            require(
                tokenBeforeTransfer >= (25000 * (10**infiTokenDecimal)),
                "ERR_AUTH_4"
            );
        } else if (_insuredSum > (100000 * (10**insuredSumCurrencyDecimal))) {
            // Diamond
            require(
                tokenBeforeTransfer >= (50000 * (10**infiTokenDecimal)),
                "ERR_AUTH_4"
            );
        }

        _;
    }

    modifier onlyAdmin() {
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );
        _;
    }

    function pause() public onlyAdmin whenNotPaused {
        _pause();
    }

    function unpause() public onlyAdmin whenPaused {
        _unpause();
    }

    function changeDependentContractAddress() external onlyAdmin {
        ld = IListingData(cg.getLatestAddress("LD"));
        infiToken = ERC20Burnable(cg.infiTokenAddr());
        coverGateway = ICoverGateway(cg.getLatestAddress("CG"));
        cd = ICoverData(cg.getLatestAddress("CD"));
        pool = IPool(cg.getLatestAddress("PL"));
        coinSigner = cg.getLatestAddress("CS");
        claimData = IClaimData(cg.getLatestAddress("CM"));
        platformData = IPlatformData(cg.getLatestAddress("PD"));
    }

    /**
     * @dev Called when member create a new Cover Request Listing, to stored listing data
     */
    function createCoverRequest(
        address from,
        uint256 value,
        bytes memory payData
    ) external override onlyInternal whenNotPaused {
        CreateCoverRequestData memory payload = abi.decode(
            payData,
            (CreateCoverRequestData)
        );

        require(payload.request.holder == from, "ERR_LG_1");

        require(
            payload.request.coverMonths >= 1 &&
                payload.request.coverMonths <= 12,
            "ERR_LG_2"
        ); // Validate Cover Period

        // expired at must between now and next 14 days
        // add 1 day as buffer, in case transaction pending on mempool
        require(
            payload.request.expiredAt >= block.timestamp &&
                payload.request.expiredAt <=
                (block.timestamp + (14 * 1 days) + 1 days),
            "ERR_LG_3"
        );

        // Set Listing Fee
        uint256 listingFee = pool.getListingFee(
            payload.request.insuredSumCurrency,
            payload.request.insuredSum,
            payload.feePricing.coinPrice,
            payload.roundId
        );

        // Verify listing fee amount
        require(listingFee == value, "ERR_LG_4");

        // Transfer 50% of listing fee to dev wallet and burn 50%
        pool.transferAndBurnInfi(listingFee);

        // Verify Coin Info Signature
        pool.verifyMessage(payload.assetPricing, coinSigner); // Validate signature Asset Price
        pool.verifyMessage(payload.feePricing, coinSigner); // Validate signature Fee Price

        // Transfer Premium to smart contract
        pool.acceptAsset(
            from,
            payload.request.insuredSumCurrency,
            payload.request.premiumSum,
            payload.premiumPermit
        );

        // verify and stored data
        _createRequest(payload, from, value);
    }

    function _createRequest(
        CreateCoverRequestData memory payload,
        address from,
        uint256 value
    )
        internal
        verifyMemberLevel(
            from,
            value,
            payload.request.insuredSum,
            payload.request.insuredSumCurrency
        )
    {
        // Set up value for Request Cover
        if (payload.request.insuredSumRule == InsuredSumRule.FULL) {
            uint8 decimal = cg.getCurrencyDecimal(
                uint8(payload.request.insuredSumCurrency)
            );
            uint256 tolerance = 2 * (10**decimal); // tolerance 2 tokens
            payload.request.insuredSumTarget =
                payload.request.insuredSum -
                tolerance;
        } else if (payload.request.insuredSumRule == InsuredSumRule.PARTIAL) {
            payload.request.insuredSumTarget = payload.request.insuredSum / 4;
        }
        // Stored data listing
        ld.storedRequest(
            payload.request,
            payload.assetPricing,
            payload.feePricing,
            from
        );
    }

    /**
     * @dev Called when member create a new Cover Offer Listing, to stored listing data
     */

    function createCoverOffer(
        address from,
        uint256 value,
        bytes memory payData
    ) external override onlyInternal whenNotPaused {
        CreateCoverOfferData memory payload = abi.decode(
            payData,
            (CreateCoverOfferData)
        );

        // expired at must between now and next 1 year
        // add 1 day as buffer, in case transaction pending on mempool
        require(
            payload.offer.expiredAt >= block.timestamp &&
                payload.offer.expiredAt <=
                (block.timestamp + (366 days) + 1 days),
            "ERR_LG_3"
        );

        // verify funder
        require(payload.offer.funder == from, "ERR_LG_1");

        uint256 insuredSumCurrencyDecimal = cg.getCurrencyDecimal(
            uint8(payload.offer.insuredSumCurrency)
        );

        // minimal deposit $1000
        require(
            payload.offer.insuredSum >= (1000 * 10**insuredSumCurrencyDecimal),
            "ERR_LG_5"
        );

        // Set Listing Fee
        uint256 listingFee = pool.getListingFee(
            payload.offer.insuredSumCurrency,
            payload.offer.insuredSum,
            payload.feePricing.coinPrice,
            payload.roundId
        );

        // Note : verify insured sum worth 1000$

        // Verify listing fee amount
        require(listingFee == value, "ERR_LG_4");

        // Transfer 50% of listing fee to dev wallet and burn 50%
        pool.transferAndBurnInfi(listingFee);

        // Verify Coin Info Signature
        pool.verifyMessage(payload.feePricing, coinSigner); // Validate signature Fee Price
        pool.verifyMessage(payload.assetPricing, coinSigner); // Validate signature Asset Price

        // Transfer collateral to current smart contract
        pool.acceptAsset(
            from,
            payload.offer.insuredSumCurrency,
            payload.offer.insuredSum,
            payload.fundingPermit
        );

        // verify and stored data
        _createOffer(payload, from, value);
    }

    function _createOffer(
        CreateCoverOfferData memory payload,
        address from,
        uint256 value
    ) internal minimumBalance(from, value) {
        // Stored data listing
        ld.storedOffer(
            payload.offer,
            payload.feePricing,
            payload.assetPricing,
            payload.depositPeriod,
            from
        );
    }

    /**
     * @dev get list of id(s) of active cover offer
     */
    function getListActiveCoverOffer()
        external
        view
        override
        returns (uint256 listLength, uint256[] memory coverOfferIds)
    {
        // Because "push" is not available in uint256[] memory outside of storage
        // Need to create workaround for push to array
        uint256 coverOfferLength = ld.getCoverOfferLength();
        coverOfferIds = new uint256[](coverOfferLength);
        uint256 iteration = 0;

        for (uint256 i = 0; i < coverOfferLength; i++) {
            CoverOffer memory coverOffer = ld.getCoverOfferById(i);
            if (coverOffer.expiredAt >= block.timestamp) {
                coverOfferIds[iteration] = i;
                iteration = iteration + 1;
            }
        }

        return (iteration, coverOfferIds);
    }

    /**
     * @dev get insured sum taken, return value will based on calculation of covers
     */
    function getInsuredSumTakenOfCoverOffer(uint256 coverOfferId)
        external
        view
        override
        returns (uint256 insuredSumTaken)
    {
        uint256[] memory listCoverIds = cd.getCoversByOfferId(coverOfferId);

        for (uint256 i = 0; i < listCoverIds.length; i++) {
            if (block.timestamp < coverGateway.getEndAt(listCoverIds[i])) {
                InsuranceCover memory cover = cd.getCoverById(listCoverIds[i]);
                // Cover still active
                insuredSumTaken += cover.insuredSum;
            } else {
                // Cover not active, check the payout for the cover
                insuredSumTaken += claimData.coverToPayout(listCoverIds[i]);
            }
        }
    }

    function getChainlinkPrice(uint8 currencyType)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 price,
            uint8 decimals
        )
    {
        require(currencyType < uint8(CurrencyType.END_ENUM), "ERR_CHNLNK_2");
        address priceFeedAddr = platformData.getOraclePriceFeedAddress(
            cg.getCurrencyName(currencyType)
        );
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);
        (roundId, price, , , ) = priceFeed.latestRoundData();
        decimals = priceFeed.decimals();
        return (roundId, price, decimals);
    }
}
