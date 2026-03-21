import { DetectionRule } from './types.js';
import { rapidFailedLogins } from './rules/rapid-failed-logins.rule.js';
import { directoryBruteForce } from './rules/directory-brute-force.rule.js';
import { distributedLogin } from './rules/distributed-login.rule.js';
import { passwordSpraying } from './rules/password-spraying.rule.js';
import { fingerprintCampaign } from './rules/fingerprint-campaign.rule.js';
import { riskScoring } from './rules/risk-scoring.rule.js';
import { securityToolDetection } from './rules/security-tool-detection.rule.js';
import { impossibleTravelRule } from './rules/impossible-travel.rule.js';

export const rules: DetectionRule[] = [
    rapidFailedLogins,
    directoryBruteForce,
    distributedLogin,
    passwordSpraying,
    fingerprintCampaign,
    riskScoring,
    securityToolDetection,
    impossibleTravelRule
];
