import { BasePlugin } from "@h1z1-server/out/servers/ZoneServer2016/managers/pluginmanager.js";
import { ZoneServer2016} from "@h1z1-server/out/servers/ZoneServer2016/zoneserver.js";
import { ZoneClient2016 as Client } from "@h1z1-server/out/servers/ZoneServer2016/classes/zoneclient";

import axios from 'axios';
import { PermissionLevels } from "@h1z1-server/out/servers/ZoneServer2016/commands/types";

async function sendWebhookMessage(webhookUrl: string, content: string) {
  try {
    await axios.post(webhookUrl, { content });
    console.log('Webhook message sent successfully.');
  } catch (error: any) {
    console.error('Error sending webhook message:', error.message);
  }
}

interface WhitelistEntry {
  serverId: number;
  characterId: string;
  whitelistingAdmin: string;
}

export default class ServerPlugin extends BasePlugin {
  public name = "Whitelist";
  public description = "Adds a whitelist to your server.";
  public author = "Meme";
  public version = "0.1";

  private joinLogsWebhook!: string;

  // characterId is used so that if a player deletes a character, they can't just change name without being re-whitelisted
  whitelisted: {[characterId: string]: WhitelistEntry} = {};

  /**
   * This method is called by PluginManager, do NOT call this manually
   * Use this method to set any plugin properties from the values in your config.yaml
  */ 
  public loadConfig(config: any) {
    this.joinLogsWebhook = config.joinLogsWebhook;
  }
  
  public async init(server: ZoneServer2016): Promise<void> {

    await this.setupMongo(server);

    this.registerZoneLoginEventHook(server);

    /* CUSTOM COMMAND TEST */

    server.pluginManager.registerCommand(this, server, {
      name: "wlist",
      permissionLevel: PermissionLevels.ADMIN,
      execute: (server: ZoneServer2016, client: Client, args: Array<string>) => {
        this.whitelistCommandExecute(server, client, args);
      }
    });

    server.pluginManager.registerCommand(this, server, {
      name: "unwhitelist",
      permissionLevel: PermissionLevels.ADMIN,
      execute: (server: ZoneServer2016, client: Client, args: Array<string>) => {
        this.unwhitelistCommandExecute(server, client, args);
      }
    });
  }

  whitelistCommandExecute(server: ZoneServer2016, client: Client, args: Array<string>) {
    const collection = server._db?.collection("whitelist"),
    characterId = args[0],
    whitelistEntry: WhitelistEntry = {
      serverId: server._worldId,
      characterId: characterId,
      whitelistingAdmin: client.character.name
    },
    found = this.whitelisted[characterId];

    if(!!found) {
      server.sendChatText(client, `CharacterId ${characterId} is already whitelisted`);
      return;
    }

    collection.insertOne(whitelistEntry)
    this.whitelisted[characterId] = whitelistEntry;
    server.sendChatText(client, `Added ${characterId} to whitelist`);
  }

  unwhitelistCommandExecute(server: ZoneServer2016, client: Client, args: Array<string>) {
    const collection = server._db?.collection("whitelist"),
    characterId = args[0],
    found = this.whitelisted[characterId];

    if(!found) {
      server.sendChatText(client, `CharacterId ${characterId} not found in whitelist`);
      return;
    }

    collection.deleteOne({
      serverId: server._worldId,
      characterId: args[0],
    });
    delete this.whitelisted[characterId];

    server.sendChatText(client, `Removed ${characterId} from whitelist`);
  }
  

  async setupMongo(server: ZoneServer2016) {
    this.whitelisted = <any>(
      await server._db
        ?.collection("whitelist")
        .find({ serverId: server._worldId })
        .toArray()
    );
  }

  registerZoneLoginEventHook(server: ZoneServer2016) {
    server.pluginManager.hookMethod(this, server, "onZoneLoginEvent", (client: Client) => {

      if(!this.whitelisted[client.character.characterId] && !client.isAdmin) {
        console.log(`Whitelist reject ${client.character.characterId}`);
        server.sendData(client, "H1emu.PrintToConsole", {
          message: `You must be whitelisted to join this server! Your characterId: ${client.character.characterId}`,
          showConsole: true,
          clearOutput: true
        })
        server.sendData(client, "H1emu.PrintToConsole", {
          message: `Restart your client after being whitelisted to join.`,
        })
        sendWebhookMessage(this.joinLogsWebhook, `${client.character.characterId} connection rejected.`);
        return false;
      }
      sendWebhookMessage(this.joinLogsWebhook, `${client.character.characterId} connected.`);
    }, {callBefore: false, callAfter: true})
  }
}