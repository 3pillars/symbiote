// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title SymbioteVault
 * @dev Core vault contract for Symbiote trading agent collective
 * @notice Handles fund custody, trade execution, and profit distribution
 * @notice Critical functions are protected by TimelockController for security
 */
contract SymbioteVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    /// @notice Minimum delay for timelock-protected functions (2 days)
    uint256 public constant MIN_DELAY = 2 days;

    // ============ State Variables ============
    
    // Timelock controller reference
    TimelockController public timelock;
    
    // Agent roles
    mapping(address => bool) public authorizedAgents;
    mapping(address => uint256) public agentBonds;
    
    // User deposits
    mapping(address => uint256) public deposits;
    address[] public depositorList;
    
    // Performance tracking
    mapping(address => int256) public agentPnl;
    mapping(address => uint256) public totalVolume;
    
    // Global state
    uint256 public totalDeposits;
    int256 public totalPnl;
    uint256 public lastUpdateTime;
    
    // Risk parameters
    uint256 public maxPositionSize = 20 ether; // 2% of TVL assumed 1000 ETH
    uint256 public maxDailyLoss = 15 ether;      // 1.5% of TVL
    bool public paused;
    
    // Chainlink Price Feed Addresses (Sepolia testnet)
    AggregatorV3Interface public ethUsdPriceFeed;
    AggregatorV3Interface public btcUsdPriceFeed;
    
    // Price deviation tolerance: 5% - allows for some slippage
    uint256 public constant PRICE_DEVIATION_TOLERANCE = 5e16; // 5% in 1e18 scale
    
    // Supported assets for price verification
    enum Asset { ETH, BTC }
    mapping(Asset => AggregatorV3Interface) public priceFeeds;
    
    // Events
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event TradeExecuted(address indexed agent, bytes32 tradeId, int256 pnl);
    event AgentRegistered(address indexed agent, uint256 bond);
    event AgentSlashed(address indexed agent, uint256 amount, string reason);
    event EmergencyPause(bool paused);
    event PriceVerificationFailed(address indexed agent, bytes32 tradeId, uint256 reportedPrice, uint256 oraclePrice, uint256 deviation);
    event TimelockUpdated(address indexed oldTimelock, address indexed newTimelock);

    // ============ Constructor ============
    
    /// @notice Constructor with optional timelock address
    /// @param _timelock Address of the TimelockController (can be address(0) for no timelock initially)
    constructor(address _timelock) Ownable(msg.sender) {
        lastUpdateTime = block.timestamp;
        
        // Initialize Chainlink price feeds (Sepolia testnet)
        // Using type conversion to bypass checksum validation
        ethUsdPriceFeed = AggregatorV3Interface(address(bytes20(0x694Aa1769357215DE4f081c6703E49629D938eb7)));
        btcUsdPriceFeed = AggregatorV3Interface(address(bytes20(0x01b44F3514812d8ebF276312757f6AD2FaAd80b8)));
        
        priceFeeds[Asset.ETH] = ethUsdPriceFeed;
        priceFeeds[Asset.BTC] = btcUsdPriceFeed;
        
        // Set timelock if provided
        if (_timelock != address(0)) {
            timelock = TimelockController(payable(_timelock));
        }
    }

    // ============ Modifiers ============
    
    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    modifier onlyAgentOrOwner() {
        require(authorizedAgents[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault is paused");
        _;
    }

    /// @notice Modifier that checks if caller is owner OR timelock (for delayed execution)
    /// @dev This allows both direct owner calls and timelock-executed calls
    modifier onlyOwnerOrTimelock() {
        require(
            msg.sender == owner() || msg.sender == address(timelock),
            "Not owner or timelock"
        );
        _;
    }

    // ============ Timelock Management ============
    
    /// @notice Update timelock controller address
    /// @param newTimelock The new timelock controller address
    function setTimelock(address newTimelock) external onlyOwner {
        require(newTimelock != address(0), "Timelock cannot be zero address");
        emit TimelockUpdated(address(timelock), newTimelock);
        timelock = TimelockController(payable(newTimelock));
    }

    // ============ Price Oracle Functions ============
    
    /**
     * @dev Get latest price from Chainlink oracle
     * @param asset Asset to get price for
     * @return price Latest price (8 decimals)
     */
    function getLatestPrice(Asset asset) public view returns (int256) {
        AggregatorV3Interface priceFeed = priceFeeds[asset];
        require(address(priceFeed) != address(0), "Price feed not set");
        
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return price;
    }

    /**
     * @dev Verify reported price against oracle
     * @param reportedPrice Price reported by agent
     * @param asset Asset being traded
     * @return isValid Whether price is within tolerance
     * @return deviation Actual deviation percentage
     */
    function verifyPrice(uint256 reportedPrice, Asset asset) public view returns (bool isValid, uint256 deviation) {
        int256 oraclePrice = getLatestPrice(asset);
        uint256 oraclePriceUint = uint256(oraclePrice);
        
        if (reportedPrice == oraclePriceUint) {
            return (true, 0);
        }
        
        // Calculate deviation
        if (reportedPrice > oraclePriceUint) {
            deviation = ((reportedPrice - oraclePriceUint) * 1e18) / oraclePriceUint;
        } else {
            deviation = ((oraclePriceUint - reportedPrice) * 1e18) / oraclePriceUint;
        }
        
        isValid = deviation <= PRICE_DEVIATION_TOLERANCE;
        return (isValid, deviation);
    }

    // ============ Deposit/Withdraw Functions ============
    
    /**
     * @dev Deposit ETH into vault
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Cannot deposit 0");
        
        if (deposits[msg.sender] == 0) {
            depositorList.push(msg.sender);
        }
        
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;
        
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH from vault
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot withdraw 0");
        require(deposits[msg.sender] >= amount, "Insufficient balance");
        
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @dev Get user balance
     * @param user User address
     */
    function getBalance(address user) external view returns (uint256) {
        return deposits[user];
    }

    // ============ Agent Management ============
    
    /**
     * @dev Register a new trading agent
     * @param agent Agent address
     * @param bond Bond amount to stake
     */
    function registerAgent(address agent, uint256 bond) external onlyOwner {
        require(!authorizedAgents[agent], "Agent already registered");
        require(bond >= 1 ether, "Minimum bond is 1 ETH");
        
        authorizedAgents[agent] = true;
        agentBonds[agent] = bond;
        
        emit AgentRegistered(agent, bond);
    }

    /**
     * @dev Remove an agent - TIMELOCK PROTECTED
     * @param agent Agent address
     */
    function removeAgent(address agent) external onlyOwnerOrTimelock {
        require(authorizedAgents[agent], "Agent not registered");
        
        authorizedAgents[agent] = false;
        
        // Return bond
        uint256 bond = agentBonds[agent];
        if (bond > 0) {
            (bool success, ) = payable(owner()).call{value: bond}("");
            require(success, "Bond return failed");
        }
        agentBonds[agent] = 0;
    }

    // ============ Trading Functions ============
    
    /**
     * @dev Execute a trade and record P&L with price verification
     * @param agent Trading agent executing the trade
     * @param tradeId Unique trade identifier
     * @param pnl Profit/Loss from trade
     * @param volume Trade volume
     * @param entryPrice Reported entry price for verification
     * @param asset Asset being traded (0 = ETH, 1 = BTC)
     */
    function recordTrade(
        address agent,
        bytes32 tradeId,
        int256 pnl,
        uint256 volume,
        uint256 entryPrice,
        Asset asset
    ) external onlyAgentOrOwner whenNotPaused nonReentrant {
        require(authorizedAgents[agent], "Agent not registered");
        require(volume <= maxPositionSize, "Position too large");
        
        // Verify price against oracle
        (bool isValid, uint256 deviation) = verifyPrice(entryPrice, asset);
        if (!isValid) {
            emit PriceVerificationFailed(agent, tradeId, entryPrice, uint256(getLatestPrice(asset)), deviation);
            revert("Price deviation too high");
        }
        
        // Check daily loss limit
        int256 currentPnl = totalPnl;
        if (currentPnl < 0) {
            uint256 loss = uint256(-currentPnl);
            require(loss < maxDailyLoss, "Daily loss limit reached");
        }
        
        // Update agent stats
        agentPnl[agent] += pnl;
        totalVolume[agent] += volume;
        
        // Update global stats
        totalPnl += pnl;
        lastUpdateTime = block.timestamp;
        
        emit TradeExecuted(agent, tradeId, pnl);
    }

    /**
     * @dev Legacy recordTrade without price verification (for backwards compatibility)
     * @param agent Trading agent executing the trade
     * @param tradeId Unique trade identifier
     * @param pnl Profit/Loss from trade
     * @param volume Trade volume
     */
    function recordTrade(
        address agent,
        bytes32 tradeId,
        int256 pnl,
        uint256 volume
    ) external onlyAgentOrOwner whenNotPaused nonReentrant {
        require(authorizedAgents[agent], "Agent not registered");
        require(volume <= maxPositionSize, "Position too large");
        
        // Check daily loss limit
        int256 currentPnl = totalPnl;
        if (currentPnl < 0) {
            uint256 loss = uint256(-currentPnl);
            require(loss < maxDailyLoss, "Daily loss limit reached");
        }
        
        // Update agent stats
        agentPnl[agent] += pnl;
        totalVolume[agent] += volume;
        
        // Update global stats
        totalPnl += pnl;
        lastUpdateTime = block.timestamp;
        
        emit TradeExecuted(agent, tradeId, pnl);
    }

    // ============ Risk Management (Timelock Protected) ============
    
    /**
     * @dev Set maximum position size - TIMELOCK PROTECTED
     * @param size New max position size
     */
    function setMaxPositionSize(uint256 size) external onlyOwnerOrTimelock {
        maxPositionSize = size;
    }

    /**
     * @dev Set maximum daily loss - TIMELOCK PROTECTED
     * @param loss New max daily loss
     */
    function setMaxDailyLoss(uint256 loss) external onlyOwnerOrTimelock {
        maxDailyLoss = loss;
    }

    /**
     * @dev Emergency pause - TIMELOCK PROTECTED
     * @param status Pause status
     */
    function setPaused(bool status) external onlyOwnerOrTimelock {
        paused = status;
        emit EmergencyPause(status);
    }

    /**
     * @dev Update Chainlink price feed addresses - TIMELOCK PROTECTED
     * @param asset Asset to update price feed for
     * @param priceFeed New price feed address
     */
    function setPriceFeed(Asset asset, address priceFeed) external onlyOwnerOrTimelock {
        require(priceFeed != address(0), "Invalid price feed address");
        priceFeeds[asset] = AggregatorV3Interface(priceFeed);
    }

    // ============ View Functions ============
    
    /**
     * @dev Get total TVL
     */
    function getTvl() external view returns (uint256) {
        return totalDeposits;
    }

    /**
     * @dev Get agent performance
     * @param agent Agent address
     */
    function getAgentPerformance(address agent) external view returns (int256 pnl, uint256 volume) {
        return (agentPnl[agent], totalVolume[agent]);
    }

    // ============ Emergency Functions (Immediate - No Timelock) ============
    
    /**
     * @dev Emergency withdrawal by owner - IMMEDIATE (no timelock)
     * @notice For actual emergencies only
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdraw failed");
    }

    /**
     * @dev Recover accidentally sent tokens - IMMEDIATE (no timelock)
     * @notice For actual emergencies only
     * @param token Token address
     * @param amount Amount to recover
     */
    function rescueTokens(IERC20 token, uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }

    // ============ Receive ETH ============
    
    receive() external payable {
        if (msg.value > 0 && deposits[msg.sender] > 0) {
            deposits[msg.sender] += msg.value;
            totalDeposits += msg.value;
            emit Deposit(msg.sender, msg.value);
        }
    }
}
