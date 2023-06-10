import { BasePlugin } from "@h1z1-server/out/servers/ZoneServer2016/managers/pluginmanager.js";
import { ZoneServer2016} from "@h1z1-server/out/servers/ZoneServer2016/zoneserver.js";
import { ZoneClient2016 as Client } from "@h1z1-server/out/servers/ZoneServer2016/classes/zoneclient";

import axios from 'axios';

async function sendWebhookMessage(webhookUrl: string, content: string) {
  try {
    await axios.post(webhookUrl, { content });
    console.log('Webhook message sent successfully.');
  } catch (error: any) {
    console.error('Error sending webhook message:', error.message);
  }
}

export default class ServerPlugin extends BasePlugin {
  public name = "Whitelist";
  public description = "This is a template for an h1z1-server plugin.";
  public author = "H1emu";
  public version = "0.1";

  private joinLogsWebhook!: string;

  /**
   * This method is called by PluginManager, do NOT call this manually
   * Use this method to set any plugin properties from the values in your config.yaml
  */ 
  public loadConfig(config: any) {
    this.joinLogsWebhook = config.joinLogsWebhook;
  }
  
  public init(server: ZoneServer2016): void {

    const onZoneLoginEvent = server.onZoneLoginEvent;

    server.onZoneLoginEvent = (client: Client) => {

      // setup mongo whitelist table + whitelist command ingame and rcon command eventually

      
      if(client.loginSessionId == "0x7e71738cb63c735e") {
        console.log(`Whitelist reject ${client.loginSessionId}`);
        //server.sendData(client, "LoginFailed", {});
        server.sendData(client, "H1emu.PrintToConsole", {
          message: `You must be whitelisted to join this server! Your zoneId: ${client.loginSessionId}`,
          showConsole: true,
          clearOutput: true
        })
        sendWebhookMessage(this.joinLogsWebhook, `${client.loginSessionId} connection rejected.`);
        return;
      }
      sendWebhookMessage(this.joinLogsWebhook, `${client.loginSessionId} connected.`);
      onZoneLoginEvent.call(server, client);
    }

  }

}