// Utility functions to decode JWT tokens and extract information

export const decodeJWT = (token: string): any => {
  try {
    // Split the JWT token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode the payload (second part). JWTs are base64URL-encoded: convert
    // the URL-safe chars back to standard base64 BEFORE atob, otherwise a
    // token containing '-' or '_' fails to decode and a valid session looks
    // expired (was causing instant "session expired" logouts for drivers).
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64 + '='.repeat((4 - base64.length % 4) % 4);

    // Use the built-in atob function for base64 decoding
    const decodedPayload = atob(paddedPayload);
    
    // Parse the JSON payload
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('❌ JWT decode error:', error);
    return null;
  }
};

export const extractUserIdFromJWT = (token: string): string | null => {
  try {
    const decoded = decodeJWT(token);
    if (decoded && decoded.sub) {
      return decoded.sub;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to extract user ID from JWT:', error);
    return null;
  }
};

export const extractOrgIdFromJWT = (token: string): string | null => {
  try {
    const decoded = decodeJWT(token);
    if (decoded && decoded.org_id) {
      return decoded.org_id;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to extract org ID from JWT:', error);
    return null;
  }
};

export const isJWTExpired = (token: string): boolean => {
  try {
    const decoded = decodeJWT(token);
    if (decoded && decoded.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    }
    return true; // Consider expired if no expiration time
  } catch (error) {
    console.error('❌ Failed to check JWT expiration:', error);
    return true; // Consider expired on error
  }
}; 
