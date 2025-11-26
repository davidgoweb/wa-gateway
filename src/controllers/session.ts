import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware";
import { toDataURL } from "qrcode";
import { HTTPException } from "hono/http-exception";
import { completelyDeleteSession } from "../utils/sessionCleanup";

export const createSessionController = () => {
  const app = new Hono();

  app.get("/", createKeyMiddleware(), async (c) => {
    return c.json({
      data: whatsapp.getAllSession(),
    });
  });

  const startSessionSchema = z.object({
    session: z.string(),
  });

  app.post(
    "/start",
    createKeyMiddleware(),
    requestValidator("json", startSessionSchema),
    async (c) => {
      try {
        const payload = c.req.valid("json");

        const isExist = whatsapp.getSession(payload.session);
        
        // Check if session is actually connected (has user property)
        const isConnected = isExist && isExist.user !== undefined;

        if (isConnected) {
          throw new HTTPException(400, {
            message: "Session already connected",
          });
        }
        
        // If session exists but is not connected, clean it up first
        if (isExist && !isConnected) {
          await completelyDeleteSession(payload.session);
        }
        
        const qr = await new Promise<string | null>(async (resolve, reject) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.error(`Session ${payload.session} timeout - no QR code received within 30 seconds`);
              reject(new Error("Session start timeout - no QR code received within 30 seconds"));
            }
          }, 30000); // 30 second timeout
          
          try {
            await whatsapp.startSession(payload.session, {
              onConnected() {
                console.log(`Session ${payload.session} connected callback triggered`);
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null); // Resolve with null to indicate successful connection
                }
              },
              onQRUpdated(qr) {
                if (!resolved && qr) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(qr);
                }
              }
            });
          } catch (error) {
            console.error(`Error in whatsapp.startSession for ${payload.session}:`, error);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(error);
            }
          }
        });

        if (qr) {
          // Send QR code to webhook
          if ((global as any).webhookSession) {
            const qrBase64 = await toDataURL(qr);
            (global as any).webhookSession({
              session: payload.session,
              status: "connecting",
              qr: qrBase64
            });
          }
          
          // Store QR code globally for onConnecting event
          if (!(global as any).sessionQRCodes) {
            (global as any).sessionQRCodes = {};
          }
          (global as any).sessionQRCodes[payload.session] = await toDataURL(qr);
          
          return c.json({
            qr: await toDataURL(qr),
          });
        }

        return c.json({
          data: {
            message: "Connected",
          },
        });
      } catch (error) {
        console.error(`Error starting session:`, error);
        
        if (error instanceof HTTPException) {
          throw error;
        }
        
        throw new HTTPException(500, {
          message: `Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );
   app.get(
    "/start",
    createKeyMiddleware(),
    requestValidator("query", startSessionSchema),
    async (c) => {
      try {
        const payload = c.req.valid("query");

        const isExist = whatsapp.getSession(payload.session);
        
        // Check if session is actually connected (has user property)
        const isConnected = isExist && isExist.user !== undefined;

        if (isConnected) {
          throw new HTTPException(400, {
            message: "Session already connected",
          });
        }
        
        // If session exists but is not connected, clean it up first
        if (isExist && !isConnected) {
          await completelyDeleteSession(payload.session);
        }

        console.log(`Starting session ${payload.session}...`);
        console.log(`Session exists before start: ${!!whatsapp.getSession(payload.session)}`);
        
        const qr = await new Promise<string | null>(async (resolve, reject) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.error(`Session ${payload.session} timeout - no QR code received within 30 seconds`);
              console.log(`Current sessions: ${JSON.stringify(whatsapp.getAllSession())}`);
              reject(new Error("Session start timeout - no QR code received within 30 seconds"));
            }
          }, 30000); // 30 second timeout
          
          try {
            await whatsapp.startSession(payload.session, {
              onConnected() {
                console.log(`Session ${payload.session} connected callback triggered`);
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null);
                }
              },
              onQRUpdated(qr) {
                if (!resolved && qr) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(qr);
                }
              }
            });
          } catch (error) {
            console.error(`Error in whatsapp.startSession for ${payload.session}:`, error);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(error);
            }
          }
        });

        if (qr) {
          // Store custom webhook URL if provided
          if (payload.default_webhook_url) {
            // We'll store this in a way that can be accessed later
            // For now, we'll use a simple approach with a global object
            // In a production app, you might want to use a database
            if (!(global as any).customWebhooks) {
              (global as any).customWebhooks = {};
            }
            (global as any).customWebhooks[payload.session] = payload.default_webhook_url;
          }
          
          // Send QR code to webhook
          if ((global as any).webhookSession) {
            const qrBase64 = await toDataURL(qr);
            (global as any).webhookSession({
              session: payload.session,
              status: "connecting",
              qr: qrBase64
            });
          }
          
          // Store QR code globally for onConnecting event
          if (!(global as any).sessionQRCodes) {
            (global as any).sessionQRCodes = {};
          }
          (global as any).sessionQRCodes[payload.session] = await toDataURL(qr);
          
          return c.render(`
              <img src="${await toDataURL(qr)}">
              `);
        }

        return c.json({
          data: {
            message: "Connected",
          },
        });
      } catch (error) {
        console.error(`Error starting session:`, error);
        
        if (error instanceof HTTPException) {
          throw error;
        }
        
        throw new HTTPException(500, {
          message: `Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  app.all("/logout", createKeyMiddleware(), async (c) => {
    await whatsapp.deleteSession(
      c.req.query().session || (await c.req.json()).session || ""
    );
    return c.json({
      data: "success",
    });
  });

  return app;
};
