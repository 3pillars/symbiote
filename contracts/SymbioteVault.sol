// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SymbioteVault
 * @dev Core vault contract for Symbiote trading agent collective
 * @notice Handles fund custody, trade execution, and profit distribution
 */
contract SymbioteVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    
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
    
    // Events
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event TradeExecuted(address indexed agent, bytes32 tradeId, int256 pnl);
    event AgentRegistered(address indexed agent, uint256 bond);
    event AgentSlashed(address indexed agent, uint256 amount, string reason);
    event EmergencyPause(bool paused);

    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        lastUpdateTime = block.timestamp;
    }

    // ============ Modifiers ============
    
    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault is paused");
        _;
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
     * @dev Remove an agent
     * @param agent Agent address
     */
    function removeAgent(address agent) external onlyOwner {
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
     * @dev Execute a trade and record P&L
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
    ) external onlyAgent whenNotPaused nonReentrant {
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

    // ============ Risk Management ============
    
    /**
     * @dev Set maximum position size
     * @param size New max position size
     */
    function setMaxPositionSize(uint256 size) external onlyOwner {
        maxPositionSize = size;
    }

    /**
     * @dev Set maximum daily loss
     * @param loss New max daily loss
     */
    function setMaxDailyLoss(uint256 loss) external onlyOwner {
        maxDailyLoss = loss;
    }

    /**
     * @dev Emergency pause
     * @param status Pause status
     */
    function setPaused(bool status) external onlyOwner {
        paused = status;
        emit EmergencyPause(status);
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

    // ============ Emergency Functions ============
    
    /**
     * @dev Emergency withdrawal by owner
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdraw failed");
    }

    /**
     * @dev Recover accidentally sent tokens
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
