import { BasePlugin } from "@h1z1-server/out/servers/ZoneServer2016/managers/pluginmanager.js";
import { ZoneServer2016} from "@h1z1-server/out/servers/ZoneServer2016/zoneserver.js";
import { ZoneClient2016 as Client } from "@h1z1-server/out/servers/ZoneServer2016/classes/zoneclient";

import axios from 'axios';
import { Command, PermissionLevels } from "@h1z1-server/out/servers/ZoneServer2016/commands/types";

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
  guid: string;
  whitelistingAdmin: string;
}

export default class ServerPlugin extends BasePlugin {
  public name = "Whitelist";
  public description = "Adds a whitelist to your server.";
  public author = "Meme";
  public version = "0.3";

  private joinLogsWebhook!: string;

  // guid is used so that if a player deletes a character, they can't just change name without being re-whitelisted
  public whitelisted: {[guid: string]: WhitelistEntry} = {};
  public commands = [
    {
      name: "wlinfo",
      description: "Displays info about the whitelist plugin.",
      permissionLevel: PermissionLevels.ADMIN,
      execute: (server: ZoneServer2016, client: Client, args: Array<string>) => {
        this.wlinfoCommandExecute(server, client, args);
      }
    },
    {
      name: "wladd",
      description: "Adds a user by guid to the whitelist.",
      permissionLevel: PermissionLevels.ADMIN,
      execute: (server: ZoneServer2016, client: Client, args: Array<string>) => {
        this.wladdCommandExecute(server, client, args);
      }
    },
    {
      name: "wlremove",
      description: "Removes a user by guid from the whitelist.",
      permissionLevel: PermissionLevels.ADMIN,
      execute: (server: ZoneServer2016, client: Client, args: Array<string>) => {
        this.wlremoveCommandExecute(server, client, args);
      }
    }
  ];

  /**
   * This method is called by PluginManager, do NOT call this manually
   * Use this method to set any plugin properties from the values in your config.yaml
  */ 
  public loadConfig(config: any) {
    this.joinLogsWebhook = config.joinLogsWebhook;
  }
  
  public async init(server: ZoneServer2016): Promise<void> {
    if(server._soloMode) {
      console.error("[Whitelist] Whitelist disabled due to server being in solo mode!")
      return;
    }

    await this.setupMongo(server);

    this.registerZoneLoginEventHook(server);
  }

  /**
   * Executes the whitelist add command to add a character to the whitelist.
   * @param server - The ZoneServer2016 instance.
   * @param client - The client executing the command.
   * @param args - The command arguments.
   */
  wladdCommandExecute(server: ZoneServer2016, client: Client, args: Array<string>) {
    const collection = server._db?.collection("whitelist"),
    guid = args[0],
    whitelistEntry: WhitelistEntry = {
      serverId: server._worldId,
      guid: guid,
      whitelistingAdmin: client.character.name
    },
    found = this.whitelisted[guid];
     
    if(!args[0]) {
      server.sendChatText(client, "Missing guid.");
      return;
    }

    if(!!found) {
      server.sendChatText(client, `guid ${guid} is already whitelisted`);
      return;
    }

    collection.insertOne(whitelistEntry)
    this.whitelisted[guid] = whitelistEntry;
    server.sendChatText(client, `Added ${guid} to whitelist`);
  }

  /**
   * Executes the whitelist remove command to remove a character from the whitelist.
   * @param server - The ZoneServer2016 instance.
   * @param client - The client executing the command.
   * @param args - The command arguments.
   */
  wlremoveCommandExecute(server: ZoneServer2016, client: Client, args: Array<string>) {
    const collection = server._db?.collection("whitelist"),
    guid = args[0],
    found = this.whitelisted[guid];

    if(!args[0]) {
      server.sendChatText(client, "Missing guid.");
      return;
    }

    if(!found) {
      server.sendChatText(client, `guid ${guid} not found in whitelist`);
      return;
    }

    collection.deleteOne({
      serverId: server._worldId,
      guid: args[0],
    });
    delete this.whitelisted[guid];

    server.sendChatText(client, `Removed ${guid} from whitelist`);
  }

  /**
   * Displays info about the whitelist plugin, including commands.
   * @param server - The ZoneServer2016 instance.
   * @param client - The client executing the command.
   * @param args - The command arguments.
   */
  async wlinfoCommandExecute(server: ZoneServer2016, client: Client, args: Array<string>) {
    const collection = server._db?.collection("whitelist"),
    whitelisted = await collection.countDocuments() || -1;

    server.sendData(client, "H1emu.PrintToConsole", {
      message: `${this.name} plugin version: ${this.version}\nCurrently whitelisted characters: ${whitelisted}\nCommands:\n`,
      showConsole: true,
      clearOutput: true
    });

    server.pluginManager.listCommands(server, client, this);
  }
  
  /**
   * Sets up the whitelist from the MongoDB collection.
   * @param server - The ZoneServer2016 instance.
   */
  async setupMongo(server: ZoneServer2016) {
    const whitelisted = (await server._db
      ?.collection("whitelist")
      .find({ serverId: server._worldId })
      .toArray()) as any;

    whitelisted.forEach((entry: WhitelistEntry) => {
      this.whitelisted[entry.guid] = entry;
    });
  }

  /**
   * Registers a hook for the ZoneLogin event.
   * @param server - The ZoneServer2016 instance.
   */
  registerZoneLoginEventHook(server: ZoneServer2016) {
    server.pluginManager.hookMethod(this, server, "onZoneLoginEvent", (client: Client) => {

      if(this.whitelisted[client.loginSessionId] || client.isAdmin) {
        sendWebhookMessage(this.joinLogsWebhook, `${client.loginSessionId} connected.`);
        return;
      }

      console.log(`Whitelist reject ${client.loginSessionId}`);
      server.sendData(client, "H1emu.PrintToConsole", {
        message: `You must be whitelisted to join this server! Your guid: ${client.loginSessionId}`,
        showConsole: true,
        clearOutput: true
      })
      server.sendData(client, "H1emu.PrintToConsole", {
        message: `Restart your client after being whitelisted to join.`,
      })
      sendWebhookMessage(this.joinLogsWebhook, `${client.loginSessionId} connection rejected.`);
      return false;
    }, {callBefore: false, callAfter: true})
  }
}