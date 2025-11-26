
import * as whatsapp from 'wa-multi-session';

export async function completelyDeleteSession(sessionName: string): Promise<void> {
  
  try {
    // First, force disconnect the session if it exists
    const session = whatsapp.getSession(sessionName);
    if (session) {
      try {
        // Try to disconnect first
        await (whatsapp as any).disconnectSession?.(sessionName);
      } catch (e) {
      }
    }
    
    // Use the library's delete method
    await whatsapp.deleteSession(sessionName);
    
    // Wait a bit for library cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error(`Error during complete session deletion for ${sessionName}:`, error);
    throw error;
  }
}
