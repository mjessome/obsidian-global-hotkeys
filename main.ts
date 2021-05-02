import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
const remote = require('electron').remote;

interface GlobalHotkeysPluginSettings {
  accelerators: { [key: string]: string };
}

const DEFAULT_SETTINGS: GlobalHotkeysPluginSettings = {
  accelerators: {},
}

export default class GlobalHotkeysPlugin extends Plugin {
  settings: GlobalHotkeysPluginSettings;

  async registerGlobalShortcut(accelerator:string, callback:()=>void) {
    remote.globalShortcut.register(accelerator, () => {
      this.app.setting.close(); // Ensure all modals are closed?
      callback();
      remote.getCurrentWindow().show(); // Activate obsidian
    });
  }

  async onload() {

    this.addCommand({
      id: 'bring-to-front',
      name: 'Bring Obsidian to front',
      checkCallback: (checking: boolean) => {
        if (!checking)
          remote.getCurrentWindow().show();
        return true;
      }
    });

    await this.loadSettings();

    for (const cmd in this.settings.accelerators) {
      const a = this.settings.accelerators[cmd];
      if (!a) continue;
      this.registerGlobalShortcut(a, () => {
        const command = app.commands.commands[cmd];
        if (command) {
          if (command.checkCallback)
            command.checkCallback(false);
          else if (command.callback)
            command.callback();
        }
      });
    }

    this.addSettingTab(new GlobalShortcutSettingTab(this.app, this));
  }

  onunload() {
    remote.globalShortcut.unregisterAll();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class GlobalShortcutSettingTab extends PluginSettingTab {
  plugin: GlobalHotkeysPlugin;
  filterString: string;
  settingElems: Setting[];

  constructor(app: App, plugin: GlobalHotkeysPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.filterString = "";
  }

  updateHotkeyVisibility() {
    this.settingElems.forEach((e) => {
      const elemName = e.nameEl.textContent.toLowerCase();
      const visible = this.filterString.length == 0 || elemName.contains(this.filterString);
      if (visible)
        e.settingEl.show();
      else
        e.settingEl.hide();
    });
  }

  display(): void {
    let {containerEl} = this;
    this.settingElems = []

    containerEl.empty();
    containerEl.createDiv('hotkey-search-container', div => {
      let filterEl = document.createElement('input');
      div.appendChild(filterEl);
      filterEl.setAttribute('type', 'text');
      filterEl.setAttribute('placeholder', 'Filter...');
      filterEl.value = this.filterString;
      filterEl.addEventListener('input', e => {
        this.filterString = e.target.value.toLowerCase();
        this.updateHotkeyVisibility();
      });
    });

    let allCmds = this.app.commands.commands;

    const cmdKeys = Object.keys(allCmds);
    cmdKeys.sort((e1, e2) => (allCmds[e1].name < allCmds[e2].name) ? -1 : 1);
    cmdKeys.forEach(cmd => {
      const accelerator = this.plugin.settings.accelerators[cmd];
      const name = allCmds[cmd].name;
      this.settingElems.push(new Setting(containerEl)
        .setName(name)
        .addText(text => text
                 .setPlaceholder('Hotkey')
                 .setValue(accelerator)
                 .onChange(async (value) => {
                   if (value) {
                     this.plugin.settings.accelerators[cmd] = value;
                   } else if (cmd in this.plugin.settings.accelerators) {
                     delete this.plugin.settings.accelerators[cmd];
                   }
                   await this.plugin.saveSettings();
                 })));
      });

    this.updateHotkeyVisibility();
  }
}
