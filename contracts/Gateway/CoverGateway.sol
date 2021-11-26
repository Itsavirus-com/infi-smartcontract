// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICoverData} from "../Interfaces/ICoverData.sol";
import {IListingData} from "../Interfaces/IListingData.sol";
import {ICoverGateway} from "../Interfaces/ICoverGateway.sol";
import {IPool} from "../Interfaces/IPool.sol";
import {IListingGateway} from "../Interfaces/IListingGateway.sol";
import {CoverData} from "../Data/CoverData.sol";
import {ListingData} from "../Data/ListingData.sol";
import {Pool} from "../Capital/Pool.sol";
import {ListingGateway} from "./ListingGateway.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

contract CoverGateway is ICoverGateway, Pausable {
    // State variables
    ICoverData public cd;
    IListingData public ld;
    IPool public pool;
    IListingGateway public lg;
    address public coinSigner;
    address public override devWallet;
    ERC20Burnable internal infiToken;

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
        cd = ICoverData(cg.getLatestAddress("CD"));
        ld = IListingData(cg.getLatestAddress("LD"));
        lg = IListingGateway(cg.getLatestAddress("LG"));
        pool = IPool(cg.getLatestAddress("PL"));
        coinSigner = cg.getLatestAddress("CS");
        devWallet = cg.getLatestAddress("DW");
        infiToken = ERC20Burnable(cg.infiTokenAddr());
    }

    /**
     * @dev Called when member take an offer
     */
    function buyCover(BuyCover calldata buyCoverData)
        external
        override
        minimumBalance(msg.sender, 0)
        whenNotPaused
    {
        // Get listing data
        CoverOffer memory offer = ld.getCoverOfferById(buyCoverData.offerId);

        // Funder cannot buy own offer
        require(msg.sender != offer.funder, "ERR_CG_1");

        // Check if offer still valid
        require(block.timestamp <= offer.expiredAt, "ERR_CG_2");
        require(buyCoverData.coverMonths >= offer.minCoverMonths, "ERR_CG_3");

        // Check if offer still be able to take (not biggetrthan offer.insuredSumRemaining)
        require(
            buyCoverData.insuredSum <=
                (offer.insuredSum -
                    lg.getInsuredSumTakenOfCoverOffer(buyCoverData.offerId)),
            "ERR_CG_4"
        );

        // verify assetPriceInfo signature
        pool.verifyMessage(buyCoverData.assetPricing, coinSigner);

        //  Validate insured sum
        uint256 insuredSumCurrencyDecimal = cg.getCurrencyDecimal(
            uint8(offer.insuredSumCurrency)
        );

        // Check cover qty validity
        require(buyCoverData.coverQty / 10**18 > 0, "ERR_CLG_28");

        // Base Formula : Insured Sum = coverQty * coinPrice
        // coin Price : price of 1 qty to insured sum currency
        // the result will be in insuredSumCurrencyDecumal
        uint256 calculationInsuredSum = (buyCoverData.coverQty * // buyCoverData.coverQty formatted using 18 decimals
            buyCoverData.assetPricing.coinPrice * // buyCoverData.assetPricing.coinPrice formatted using 6 decimals
            (10**insuredSumCurrencyDecimal)) /
            (10**18) / // neutralize cover qty
            (10**6); // neutralize coin price

        require(buyCoverData.insuredSum == calculationInsuredSum, "ERR_CG_5");

        // If full uptake
        if (offer.insuredSumRule == InsuredSumRule.FULL) {
            require(offer.insuredSum == buyCoverData.insuredSum, "ERR_CG_6");
        }

        uint256 totalPremium = (buyCoverData.coverQty *
            offer.premiumCostPerMonth *
            buyCoverData.coverMonths) / 10**18; // 10**18 is cover qty decimal

        // Check total premium amount
        require(totalPremium > 0, "ERR_CLG_29");

        // Accept Asset from buyer to pool
        pool.acceptAsset(
            msg.sender,
            offer.premiumCurrency,
            totalPremium,
            buyCoverData.premiumPermit
        );

        // Transfer Premium to Provider (80%) and Dev (20%)
        pool.transferAsset(
            offer.funder,
            offer.premiumCurrency,
            (totalPremium * 8) / 10
        ); // send premium to provider
        pool.transferAsset(
            devWallet,
            offer.premiumCurrency,
            (totalPremium - (totalPremium * 8) / 10)
        ); // send premium to devx

        // Deduct remaining insured sum
        uint256 insuredSumTaken = ld.offerIdToInsuredSumTaken(
            buyCoverData.offerId
        ) + buyCoverData.insuredSum;
        ld.updateOfferInsuredSumTaken(buyCoverData.offerId, insuredSumTaken);

        // Stored Data
        uint8 coverMonths = buyCoverData.coverMonths;
        InsuranceCover memory coverData;
        coverData.offerId = buyCoverData.offerId;
        coverData.requestId = 0;
        coverData.listingType = ListingType.OFFER;
        coverData.holder = buyCoverData.buyer;
        coverData.insuredSum = buyCoverData.insuredSum;
        coverData.coverQty = buyCoverData.coverQty;
        cd.storeCoverByTakeOffer(coverData, coverMonths, offer.funder);
    }

    /**
     * @dev Called when member take a request
     */
    function provideCover(ProvideCover calldata provideCoverData)
        external
        override
        minimumBalance(msg.sender, 0)
        whenNotPaused
    {
        // Get listing data
        CoverRequest memory request = ld.getCoverRequestById(
            provideCoverData.requestId
        );

        // Holder cannot provide own request
        require(msg.sender != request.holder, "ERR_CG_1");

        // Check if request still valid
        require(block.timestamp <= request.expiredAt, "ERR_CG_2");

        require(!isRequestCoverSucceed(provideCoverData.requestId), "ERR_CG_7");

        // Check if request still be able to take (not bigger than insuredSumRemaining)
        require(
            provideCoverData.fundingSum <=
                (request.insuredSum -
                    ld.requestIdToInsuredSumTaken(provideCoverData.requestId)),
            "ERR_CG_4"
        );

        // verify assetPriceInfo signature
        pool.verifyMessage(provideCoverData.assetPricing, coinSigner);

        // Collect Collateral
        CurrencyType insuredSumCurrency = request.insuredSumCurrency;
        pool.acceptAsset(
            msg.sender,
            insuredSumCurrency,
            provideCoverData.fundingSum,
            provideCoverData.assetPermit
        );

        // Deduct remaining insured sum
        uint256 insuredSumTaken = ld.requestIdToInsuredSumTaken(
            provideCoverData.requestId
        ) + provideCoverData.fundingSum;
        ld.updateRequestInsuredSumTaken(
            provideCoverData.requestId,
            insuredSumTaken
        );

        //
        uint256 insuredSumCurrencyDecimal = cg.getCurrencyDecimal(
            uint8(request.insuredSumCurrency)
        );

        // minimal deposit $1000 if remaining insured sum >= $1000
        if (
            (request.insuredSum -
                ld.requestIdToInsuredSumTaken(provideCoverData.requestId)) >=
            1000 * (10**insuredSumCurrencyDecimal)
        ) {
            require(
                provideCoverData.fundingSum >=
                    1000 * (10**insuredSumCurrencyDecimal),
                "ERR_CG_8"
            );
        }

        // Stored Data
        CoverFunding memory booking;
        booking.requestId = provideCoverData.requestId;
        booking.funder = provideCoverData.provider;
        booking.fundingSum = provideCoverData.fundingSum;
        cd.storeBookingByTakeRequest(booking);

        // Set startAt as 0 to identified as cover not started
        InsuranceCover memory coverData;
        coverData.offerId = 0;
        coverData.requestId = provideCoverData.requestId;
        coverData.listingType = ListingType.REQUEST;
        coverData.holder = request.holder;
        coverData.insuredSum = provideCoverData.fundingSum;
        // Multiply by 10**12, 10**6 for cover qty decimals & 10**6 for neutralize division by coinPrice
        coverData.coverQty =
            (provideCoverData.fundingSum * 10**12) /
            provideCoverData.assetPricing.coinPrice;
        cd.storeCoverByTakeRequest(
            coverData,
            request.coverMonths,
            provideCoverData.provider
        );

        // either its full or partial funding, as long as its fully funded then start cover
        if (ld.isRequestFullyFunded(provideCoverData.requestId)) {
            ld.setCoverRequestFullyFundedAt(
                provideCoverData.requestId,
                block.timestamp
            );
        }
    }

    /**
     * @dev get actual state of cover request
     */
    function isRequestCoverSucceed(uint256 requestId)
        public
        view
        override
        returns (bool state)
    {
        CoverRequest memory coverRequest = ld.getCoverRequestById(requestId);

        if (
            ld.isRequestFullyFunded(requestId) ||
            (coverRequest.insuredSumRule == InsuredSumRule.PARTIAL &&
                block.timestamp > coverRequest.expiredAt &&
                ld.isRequestReachTarget(requestId))
        ) {
            state = true;
        } else {
            state = false;
        }
    }

    /**
     * @dev calculate startAt of cover
     */
    function getStartAt(uint256 coverId)
        public
        view
        override
        returns (uint256 startAt)
    {
        InsuranceCover memory cover = cd.getCoverById(coverId);

        if (cover.listingType == ListingType.REQUEST) {
            CoverRequest memory coverRequest = ld.getCoverRequestById(
                cover.requestId
            );

            if (ld.isRequestFullyFunded(cover.requestId)) {
                startAt = ld.coverRequestFullyFundedAt(cover.requestId);
            } else if (
                coverRequest.insuredSumRule == InsuredSumRule.PARTIAL &&
                block.timestamp > coverRequest.expiredAt &&
                ld.isRequestReachTarget(cover.requestId)
            ) {
                startAt = coverRequest.expiredAt;
            }
        } else if (cover.listingType == ListingType.OFFER) {
            startAt = cd.insuranceCoverStartAt(coverId);
        }
    }

    /**
     * @dev calculate endAt for cover
     */
    function getEndAt(uint256 coverId)
        external
        view
        override
        returns (uint256 endAt)
    {
        InsuranceCover memory cover = cd.getCoverById(coverId);
        uint8 coverMonths = 0;
        if (cover.listingType == ListingType.REQUEST) {
            CoverRequest memory coverRequest = ld.getCoverRequestById(
                cover.requestId
            );
            coverMonths = coverRequest.coverMonths;
        } else if (cover.listingType == ListingType.OFFER) {
            // CoverOffer memory coverOffer = ld.getCoverOfferById(cover.offerId);
            coverMonths = cd.getCoverMonths(coverId);
        }
        return (getStartAt(coverId) + (uint256(coverMonths) * 30 days));
    }
}
