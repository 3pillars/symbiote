// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @dev Registry contract for Symbiote trading agents
 * @notice Tracks agent capabilities, reputation, and bonding
 */
contract AgentRegistry is Ownable {
    
    // ============ Structs ============
    
    struct AgentInfo {
        address owner;
        bytes32 agentType;
        string[] capabilities;
        uint256[] prices;
        uint256 stakeAmount;
        uint256 reputationScore;
        uint256 lastHeartbeat;
        bool isActive;
        uint256 totalTrades;
        uint256 successfulTrades;
    }

    // ============ State Variables ============
    
    mapping(bytes32 => AgentInfo) public agents;
    mapping(address => bytes32) public addressToAgentId;
    mapping(bytes32 => string) public agentTypeNames;
    
    bytes32[] public agentIds;
    uint256 public agentCount;
    
    // Reputation constants
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant MAX_REPUTATION = 10000;
    uint256 public constant REPUTATION_UPDATE_THRESHOLD = 100;

    // Events
    event AgentRegistered(bytes32 indexed agentId, address indexed owner, bytes32 agentType);
    event AgentUpdated(bytes32 indexed agentId, string[] capabilities);
    event AgentHeartbeat(bytes32 indexed agentId);
    event AgentSlashed(bytes32 indexed agentId, uint256 amount);
    event ReputationUpdated(bytes32 indexed agentId, uint256 newScore);

    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        // Initialize agent types
        agentTypeNames[keccak256("ALPHA_SCANNER")] = "Alpha Scanner";
        agentTypeNames[keccak256("EXECUTOR")] = "Executor";
        agentTypeNames[keccak256("RISK_MANAGER")] = "Risk Manager";
        agentTypeNames[keccak256("PORTFOLIO_REBALANCER")] = "Portfolio Rebalancer";
        agentTypeNames[keccak256("MARKET_SENTIMENT")] = "Market Sentiment";
        agentTypeNames[keccak256("LIQUIDITY_MONITOR")] = "Liquidity Monitor";
    }

    // ============ Registration Functions ============
    
    /**
     * @dev Register a new agent
     * @param agentType Type of agent (e.g., "ALPHA_SCANNER")
     * @param capabilities Agent capabilities
     * @param prices Prices for each capability
     * @param stakeAmount Bond amount
     */
    function registerAgent(
        bytes32 agentType,
        string[] memory capabilities,
        uint256[] memory prices,
        uint256 stakeAmount
    ) external returns (bytes32) {
        require(stakeAmount >= MIN_STAKE, "Insufficient stake");
        require(capabilities.length == prices.length, "Length mismatch");
        require(addressToAgentId[msg.sender] == bytes32(0), "Already registered");
        
        bytes32 agentId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            agentCount
        ));
        
        agents[agentId] = AgentInfo({
            owner: msg.sender,
            agentType: agentType,
            capabilities: capabilities,
            prices: prices,
            stakeAmount: stakeAmount,
            reputationScore: 1000, // Initial reputation
            lastHeartbeat: block.timestamp,
            isActive: true,
            totalTrades: 0,
            successfulTrades: 0
        });
        
        addressToAgentId[msg.sender] = agentId;
        agentIds.push(agentId);
        agentCount++;
        
        emit AgentRegistered(agentId, msg.sender, agentType);
        
        return agentId;
    }

    /**
     * @dev Update agent capabilities
     * @param agentId Agent ID
     * @param capabilities New capabilities
     * @param prices New prices
     */
    function updateCapabilities(
        bytes32 agentId,
        string[] memory capabilities,
        uint256[] memory prices
    ) external {
        require(agents[agentId].owner == msg.sender, "Not owner");
        require(capabilities.length == prices.length, "Length mismatch");
        
        agents[agentId].capabilities = capabilities;
        agents[agentId].prices = prices;
        
        emit AgentUpdated(agentId, capabilities);
    }

    // ============ Reputation Functions ============
    
    /**
     * @dev Update agent reputation after trade
     * @param agentId Agent ID
     * @param success Whether trade was successful
     * @param pnl Profit/Loss
     */
    function updateReputation(
        bytes32 agentId,
        bool success,
        int256 pnl
    ) external onlyOwner {
        AgentInfo storage agent = agents[agentId];
        require(agent.isActive, "Agent not active");
        
        agent.totalTrades++;
        if (success) {
            agent.successfulTrades++;
            // Increase reputation
            if (pnl > 0) {
                agent.reputationScore = _min(
                    MAX_REPUTATION,
                    agent.reputationScore + uint256(pnl / 1 ether) * 10
                );
            }
        } else {
            // Decrease reputation
            agent.reputationScore = agent.reputationScore > 100 
                ? agent.reputationScore - 100 
                : 0;
        }
        
        emit ReputationUpdated(agentId, agent.reputationScore);
    }

    /**
     * @dev Agent heartbeat (must be called regularly)
     * @param agentId Agent ID
     */
    function heartbeat(bytes32 agentId) external {
        require(agents[agentId].owner == msg.sender, "Not owner");
        
        agents[agentId].lastHeartbeat = block.timestamp;
        
        emit AgentHeartbeat(agentId);
    }

    /**
     * @dev Slash agent bond
     * @param agentId Agent ID
     * @param amount Amount to slash
     */
    function slashAgent(bytes32 agentId, uint256 amount) external onlyOwner {
        AgentInfo storage agent = agents[agentId];
        require(agent.stakeAmount >= amount, "Insufficient stake");
        
        agent.stakeAmount -= amount;
        
        emit AgentSlashed(agentId, amount);
    }

    // ============ View Functions ============
    
    /**
     * @dev Get agent info
     * @param agentId Agent ID
     */
    function getAgent(bytes32 agentId) external view returns (AgentInfo memory) {
        return agents[agentId];
    }

    /**
     * @dev Get agents by type
     * @param agentType Type to filter
     */
    function getAgentsByType(bytes32 agentType) external view returns (bytes32[] memory) {
        bytes32[] memory result = new bytes32[](agentCount);
        uint256 count = 0;
        
        for (uint256 i = 0; i < agentIds.length; i++) {
            if (agents[agentIds[i]].agentType == agentType && agents[agentIds[i]].isActive) {
                result[count] = agentIds[i];
                count++;
            }
        }
        
        // Return array of correct size
        bytes32[] memory finalResult = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            finalResult[i] = result[i];
        }
        
        return finalResult;
    }

    /**
     * @dev Check if agent is active
     * @param agentId Agent ID
     */
    function isAgentActive(bytes32 agentId) external view returns (bool) {
        AgentInfo memory agent = agents[agentId];
        // Check heartbeat within 24 hours
        return agent.isActive && 
               (block.timestamp - agent.lastHeartbeat < 24 hours);
    }

    /**
     * @dev Get agent type name
     * @param agentType Type hash
     */
    function getAgentTypeName(bytes32 agentType) external view returns (string memory) {
        return agentTypeNames[agentType];
    }

    // ============ Internal ============
    
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
