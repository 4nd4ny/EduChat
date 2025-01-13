import { NextApiRequest, NextApiResponse } from 'next';
import requestIp from 'request-ip';

// Extract IPs from environment variables
const allowedIpsString = process.env.SECRET_ALLOWED_IPS || '';
const allowedIps = [
  ...allowedIpsString.split(',').map(ip => ip.trim()), // Nettoie et divise les IPs
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = requestIp.getClientIp(req) || 'unknown';
  // Function to check if the client's IP is allowed
  const isIpAllowed = (ip: string) => { return allowedIps.includes(ip); };
  res.status(200).json({ip: ip, isIpAllowed: isIpAllowed(ip)});
}
