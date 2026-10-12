import { getBridge, type KioskBridge } from './bridge';
import { mountWidget, type MountedWidget } from './widget';
import type { BootstrapPayload } from '../shared/bootstrap';
import { CLIENT_ID_PANEL_URL } from '../shared/client-id';
import { readDemoShot, sessionForDemo, type DemoShot } from '../shared/demo';
import {
  buildSdkIntegrationExtra,
  explainFaceAgeError,
  isValidEmail,
  pickEmail,
  readSelections,
  withTimeout,
} from '../shared/email';
import { createIdleClock, type IdleClock } from '../shared/idle';
import { WIDGET_LANGUAGES } from '../shared/languages';
import { validatePinFormat } from '../shared/pin';
import {
  createGuestSession,
  reduceGuestSession,
  SKIN_TYPES,
  type GuestSession,
  type SkinType,
} from '../shared/session';
import type { SettingsDraft } from '../shared/settings';

const SKIN_LABELS: Record<SkinType, string> = {
  normal: 'Normal',
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
};

export async function startKiosk(): Promise<void> {
  const bridge = getBridge();
  const bootstrap = await bridge.getBootstrap();
  const shot = readDemoShot(window.location.search, bootstrap.allowDemo);
  const app = new KioskController(bridge, bootstrap, shot);
  app.start();
}

class KioskController {
  private session: GuestSession;
  private bootstrap: BootstrapPayload;
  private readonly clock: IdleClock;
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly bottom: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly dialog: HTMLDialogElement;
  private mounted: MountedWidget | null = null;
  private resetting = false;
  private adminOpen = false;
  private staffPin = '';
  private readonly boundFrameDocs = new WeakSet<Document>();
  private statusText = '';
  private readonly forceMissingId: boolean;

  constructor(
    private readonly bridge: KioskBridge,
    bootstrap: BootstrapPayload,
    shot: DemoShot | null,
  ) {
    this.bootstrap = bootstrap;
    this.session = shot ? sessionForDemo(shot) : createGuestSession();
    this.forceMissingId = shot === 'missing-id';
    this.clock = createIdleClock(bootstrap.idleTimeoutMs);
    this.root = document.getElementById('kiosk-root') ?? document.body;
    this.stage = document.createElement('main');
    this.stage.id = 'stage';
    this.bottom = document.createElement('footer');
    this.bottom.id = 'bottom';
    this.banner = document.createElement('div');
    this.banner.id = 'idle-banner';
    this.banner.hidden = true;
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'staff-dialog';
    this.root.replaceChildren(this.header(), this.stage, this.bottom);
    document.body.append(this.banner, this.dialog);
    if (shot === 'settings') this.openStaff(true);
  }

  start(): void {
    this.clock.markActivity(Date.now());
    this.render();
    window.setInterval(() => this.tickIdle(), 250);
    const mark = () => this.clock.markActivity(Date.now());
    for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const) {
      window.addEventListener(eventName, mark, { passive: true });
    }
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F8') {
        event.preventDefault();
        this.openStaff(false);
      }
    });
    this.syncIdle(Date.now());
  }

  private clientId(): string {
    if (this.forceMissingId) return '';
    return this.bootstrap.clientId;
  }

  private header(): HTMLElement {
    const header = document.createElement('header');
    header.id = 'top';
    const brand = document.createElement('button');
    brand.type = 'button';
    brand.className = 'brand';
    const title = document.createElement('strong');
    title.textContent = 'Clinic & Salon Kiosk';
    const sub = document.createElement('span');
    sub.textContent = 'Shared reception device';
    brand.append(title, sub);
    let taps = 0;
    let tapTimer = 0;
    brand.addEventListener('click', () => {
      taps += 1;
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => {
        taps = 0;
      }, 1600);
      if (taps >= 5) {
        taps = 0;
        this.openStaff(false);
      }
    });
    const staff = document.createElement('button');
    staff.type = 'button';
    staff.className = 'staff-button';
    staff.textContent = 'Staff';
    staff.addEventListener('click', () => this.openStaff(false));
    header.append(brand, staff);
    return header;
  }

  private render(): void {
    const scanning = this.session.stage === 'scan' && this.clientId() !== '';
    document.body.classList.toggle('is-scan', scanning);
    this.stage.replaceChildren();
    this.bottom.replaceChildren();
    if (this.session.stage === 'attract') this.renderAttract();
    else if (this.session.stage === 'consent') this.renderConsent();
    else if (this.session.stage === 'quiz') this.renderQuiz();
    else this.renderScan();
    this.syncIdle(Date.now());
  }

  private renderAttract(): void {
    const card = document.createElement('section');
    card.className = 'stage-card';
    const kicker = document.createElement('p');
    kicker.className = 'eyebrow';
    kicker.textContent = 'Walk-up skin studio';
    const heading = document.createElement('h1');
    heading.textContent = 'A skin scan for the next guest';
    const lede = document.createElement('p');
    lede.className = 'lede';
    lede.textContent =
      'See skin age, skin health, and a routine built from this salon’s products. The photo is analyzed by Face Age in the cloud and cleared before the next person.';
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'primary';
    start.textContent = 'Start';
    start.addEventListener('click', () => {
      this.session = reduceGuestSession(this.session, { type: 'start' });
      this.render();
    });
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Not a diagnostic device. For cosmetic guidance only.';
    card.append(kicker, heading, lede, start, note);
    this.stage.append(card);
  }

  private renderConsent(): void {
    const card = document.createElement('section');
    card.className = 'stage-card';
    const heading = document.createElement('h1');
    heading.textContent = 'Before the camera turns on';
    const list = document.createElement('ul');
    list.className = 'points';
    for (const line of [
      'This is a cosmetic skin scan, not a medical diagnosis.',
      'The photo is sent to Face Age for analysis. It is not kept on this kiosk.',
      'An email is used only if the guest asks to receive results, then it is discarded.',
      'After 60 seconds without activity, the screen resets for the next guest.',
    ]) {
      const item = document.createElement('li');
      item.textContent = line;
      list.append(item);
    }
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.session.consentAccepted;
    box.addEventListener('change', () => {
      this.session = reduceGuestSession(this.session, { type: 'toggle-consent', accepted: box.checked });
      next.disabled = !box.checked;
    });
    label.append(box, document.createTextNode('I agree to this one-time scan.'));
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    next.textContent = 'Continue';
    next.disabled = !this.session.consentAccepted;
    next.addEventListener('click', () => {
      this.session = reduceGuestSession(this.session, { type: 'continue' });
      this.render();
    });
    card.append(heading, list, label, next);
    this.stage.append(card);
  }

  private renderQuiz(): void {
    const card = document.createElement('section');
    card.className = 'stage-card';
    const heading = document.createElement('h1');
    heading.textContent = 'A few details';
    const skinLabel = document.createElement('p');
    skinLabel.textContent = 'Skin type';
    const chips = document.createElement('div');
    chips.className = 'chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Skin type');
    for (const skinType of SKIN_TYPES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = SKIN_LABELS[skinType];
      chip.setAttribute('aria-pressed', String(this.session.skinType === skinType));
      chip.addEventListener('click', () => {
        this.session = reduceGuestSession(this.session, { type: 'set-skin', skinType });
        this.render();
      });
      chips.append(chip);
    }
    const field = document.createElement('label');
    field.className = 'field';
    field.textContent = 'Email for results (optional)';
    const email = document.createElement('input');
    email.type = 'email';
    email.autocomplete = 'off';
    email.spellcheck = false;
    email.name = 'guest-results-email';
    email.placeholder = 'name@example.com';
    email.value = this.session.email;
    email.addEventListener('input', () => {
      this.session = reduceGuestSession(this.session, { type: 'set-email', email: email.value });
    });
    field.append(email);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Used only if this guest asks for an email. It is not saved on this device.';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    next.textContent = 'Continue to scan';
    next.disabled = !this.session.skinType;
    next.addEventListener('click', () => {
      this.session = reduceGuestSession(this.session, { type: 'continue' });
      this.render();
    });
    card.append(heading, skinLabel, chips, field, hint, next);
    this.stage.append(card);
  }

  private renderScan(): void {
    if (!this.clientId()) {
      this.renderMissingClient();
      return;
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const emailButton = document.createElement('button');
    emailButton.type = 'button';
    emailButton.className = 'primary';
    emailButton.textContent = 'Email me my results';
    emailButton.addEventListener('click', () => void this.emailResults());
    const pdfButton = document.createElement('button');
    pdfButton.type = 'button';
    pdfButton.className = 'secondary';
    pdfButton.textContent = 'PDF report';
    pdfButton.addEventListener('click', () => void this.downloadPdf());
    const finish = document.createElement('button');
    finish.type = 'button';
    finish.className = 'secondary';
    finish.textContent = 'Finish';
    finish.addEventListener('click', () => void this.resetForNextGuest());
    actions.append(emailButton, pdfButton, finish);
    const status = document.createElement('p');
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.textContent = this.statusText || 'Quiz, scan, then review the routine. Nothing is kept after this visit.';
    this.bottom.append(status, actions);
    if (!this.mounted) {
      try {
        let acceptWidgetReset = false;
        window.setTimeout(() => {
          acceptWidgetReset = true;
        }, 1500);
        this.mounted = mountWidget({
          clientId: this.clientId(),
          language: this.bootstrap.settings.language,
          email: this.session.email,
          products: this.bootstrap.products,
          onReset: () => {
            if (acceptWidgetReset) void this.resetForNextGuest();
          },
        });
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'The scanner could not start.';
      }
    }
  }

  private renderMissingClient(): void {
    document.body.classList.remove('is-scan');
    const card = document.createElement('section');
    card.className = 'stage-card';
    const heading = document.createElement('h1');
    heading.textContent = 'Add a Face Age Client ID';
    const lede = document.createElement('p');
    lede.className = 'lede';
    lede.textContent =
      'This kiosk cannot run a skin scan until a Client ID is saved in Staff settings or provided for local testing with FACEAGE_CLIENT_ID.';
    const panel = document.createElement('button');
    panel.type = 'button';
    panel.className = 'primary';
    panel.textContent = 'Get a Client ID';
    panel.addEventListener('click', () => void this.bridge.openExternal(CLIENT_ID_PANEL_URL));
    const staff = document.createElement('button');
    staff.type = 'button';
    staff.className = 'secondary';
    staff.textContent = 'Staff settings';
    staff.addEventListener('click', () => this.openStaff(false));
    const linkNote = document.createElement('p');
    linkNote.className = 'hint';
    linkNote.textContent = CLIENT_ID_PANEL_URL;
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(panel, staff);
    card.append(heading, lede, actions, linkNote);
    this.stage.append(card);
  }

  private async emailResults(): Promise<void> {
    if (!this.mounted) return;
    const selections = await readSelections(this.mounted.widget.API);
    const email = pickEmail(this.session.email, selections);
    if (!isValidEmail(email)) {
      this.askForEmail();
      return;
    }
    await this.submitEmail(email);
  }

  private askForEmail(): void {
    if (this.bottom.querySelector('.email-capture')) return;
    const field = document.createElement('label');
    field.className = 'field email-capture';
    field.textContent = 'Email for this guest';
    const input = document.createElement('input');
    input.type = 'email';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'name@example.com';
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'primary';
    send.textContent = 'Send results';
    send.addEventListener('click', () => {
      this.session = reduceGuestSession(this.session, { type: 'set-email', email: input.value });
      if (!isValidEmail(input.value)) {
        this.setStatus('Enter a valid email address. It stays in memory for this visit only.');
        return;
      }
      void this.submitEmail(input.value.trim());
    });
    field.append(input, send);
    this.bottom.prepend(field);
    this.setStatus('Add an email to send this visit’s results. It is not stored on the kiosk.');
    input.focus();
  }

  private async submitEmail(email: string): Promise<void> {
    if (!this.mounted) return;
    this.setStatus('Sending results…');
    try {
      await withTimeout(
        this.mounted.widget.API.submitSdkIntegration(email, buildSdkIntegrationExtra(this.session.skinType)),
        30000,
        'The email request timed out.',
      );
      this.setStatus('Results sent. The address is cleared when the kiosk resets.');
    } catch (error) {
      this.setStatus(explainFaceAgeError(error, 'email'));
    }
  }

  private async downloadPdf(): Promise<void> {
    if (!this.mounted) return;
    this.setStatus('Preparing the PDF report…');
    try {
      await withTimeout(this.mounted.widget.API.getReportPdf(), 45000, 'The PDF request timed out.');
      this.setStatus('Report ready. A downloaded file is deleted when the kiosk resets. PDF access depends on the Face Age plan.');
    } catch (error) {
      this.setStatus(explainFaceAgeError(error, 'pdf'));
    }
  }

  private setStatus(message: string): void {
    this.statusText = message;
    const status = this.bottom.querySelector('.status');
    if (status) status.textContent = message;
  }

  /**
   * Guest activity inside the skin scanner happens in the package's own frame.
   * Listen for it there. Do not move, replace, or remove that frame.
   */
  private bindFrameActivity(): void {
    const host = document.getElementById('FaceAge-module');
    if (!host) return;
    const frames = host.querySelectorAll('iframe');
    for (const frame of frames) {
      let doc: Document | null = null;
      try {
        doc = (frame as HTMLIFrameElement).contentDocument;
      } catch {
        doc = null;
      }
      if (!doc || this.boundFrameDocs.has(doc)) continue;
      this.boundFrameDocs.add(doc);
      const mark = () => this.clock.markActivity(Date.now());
      for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const) {
        doc.addEventListener(eventName, mark, { capture: true, passive: true });
      }
    }
  }

  private syncIdle(now: number): void {
    const hold = this.session.stage === 'attract' || this.adminOpen;
    if (hold && !this.clock.paused) this.clock.pause(now);
    if (!hold && this.clock.paused) this.clock.resume(now);
  }

  private tickIdle(): void {
    const now = Date.now();
    this.bindFrameActivity();
    this.syncIdle(now);
    const phase = this.clock.phase(now);
    if (phase === 'expired' && this.session.stage !== 'attract') {
      void this.resetForNextGuest();
      return;
    }
    if (phase === 'warning' && this.session.stage !== 'attract') {
      const seconds = Math.max(1, Math.ceil(this.clock.remainingMs(now) / 1000));
      this.banner.hidden = false;
      this.banner.replaceChildren();
      const text = document.createElement('p');
      text.textContent = `Still there? Resetting for the next guest in ${seconds}s.`;
      const stay = document.createElement('button');
      stay.type = 'button';
      stay.className = 'primary';
      stay.textContent = "I'm still here";
      stay.addEventListener('click', () => this.clock.markActivity(Date.now()));
      this.banner.append(text, stay);
      return;
    }
    this.banner.hidden = true;
  }

  private async resetForNextGuest(): Promise<void> {
    if (this.resetting) return;
    this.resetting = true;
    this.mounted?.dispose();
    this.mounted = null;
    this.session = reduceGuestSession(this.session, { type: 'reset' });
    this.staffPin = '';
    try {
      await this.bridge.wipeGuestData();
    } catch {
      /* Reload still drops the in-memory visit. */
    }
    window.location.reload();
  }

  private openStaff(skipPin: boolean): void {
    this.adminOpen = true;
    this.syncIdle(Date.now());
    this.dialog.replaceChildren();
    if (skipPin) this.renderSettingsForm();
    else this.renderPinGate();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private closeStaff(): void {
    this.adminOpen = false;
    this.staffPin = '';
    this.dialog.close();
    this.syncIdle(Date.now());
  }

  private renderPinGate(): void {
    const form = document.createElement('form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void tryUnlock();
    });
    const heading = document.createElement('h2');
    heading.textContent = 'Staff PIN';
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'The first-run PIN is 2580. Change it after setup. Press F8 or tap the title five times to open this panel.';
    const input = document.createElement('input');
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = 'PIN';
    input.setAttribute('aria-label', 'Staff PIN');
    const error = document.createElement('p');
    error.className = 'warn';
    const pad = document.createElement('div');
    pad.className = 'pad';
    const push = (digit: string) => {
      input.value = `${input.value}${digit}`.slice(0, 8);
    };
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      const key = document.createElement('button');
      key.type = 'button';
      key.textContent = digit;
      key.addEventListener('click', () => push(digit));
      pad.append(key);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      input.value = '';
    });
    pad.append(clear);
    const row = document.createElement('div');
    row.className = 'actions';
    const unlock = document.createElement('button');
    unlock.type = 'submit';
    unlock.className = 'primary';
    unlock.textContent = 'Unlock';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', () => this.closeStaff());
    row.append(unlock, cancel);
    const tryUnlock = async () => {
      const accepted = await this.bridge.verifyPin(input.value);
      if (!accepted) {
        error.textContent = 'Incorrect PIN.';
        input.value = '';
        return;
      }
      this.staffPin = input.value;
      this.dialog.replaceChildren();
      this.renderSettingsForm();
    };
    form.append(heading, note, input, pad, error, row);
    this.dialog.append(form);
  }

  private renderSettingsForm(): void {
    const settings = this.bootstrap.settings;
    const heading = document.createElement('h2');
    heading.textContent = 'Kiosk settings';
    const source = document.createElement('p');
    source.className = 'hint';
    const sourceLabel =
      this.bootstrap.clientIdSource === 'environment'
        ? 'A Client ID from the local environment is active until you save one here.'
        : this.bootstrap.clientIdSource === 'settings'
          ? 'Using the Client ID saved on this device.'
          : 'No Client ID yet.';
    source.textContent = `${sourceLabel} Idle reset is ${Math.round(this.bootstrap.idleTimeoutMs / 1000)} seconds. Catalog: ${this.bootstrap.catalogSource}.`;
    if (this.bootstrap.catalogWarning) {
      const warning = document.createElement('p');
      warning.className = 'warn';
      warning.textContent = this.bootstrap.catalogWarning;
      this.dialog.append(heading, source, warning);
    } else {
      this.dialog.append(heading, source);
    }

    const form = document.createElement('form');
    form.className = 'form-grid';
    form.addEventListener('submit', (event) => event.preventDefault());
    const clientField = labeledInput('Client ID', 'text', settings.clientId);
    const language = document.createElement('select');
    language.setAttribute('aria-label', 'Widget language');
    for (const option of WIDGET_LANGUAGES) {
      const item = document.createElement('option');
      item.value = option.code;
      item.textContent = option.label;
      item.selected = option.code === settings.language;
      language.append(item);
    }
    const languageLabel = document.createElement('label');
    languageLabel.className = 'field';
    languageLabel.append(document.createTextNode('Widget language'), language);
    const pathField = labeledInput('Products JSON path', 'text', settings.productsPath);
    const json = document.createElement('textarea');
    json.value = settings.productsJson;
    json.spellcheck = false;
    json.setAttribute('aria-label', 'Products JSON');
    const jsonLabel = document.createElement('label');
    jsonLabel.className = 'field';
    jsonLabel.append(document.createTextNode('Products JSON (leave empty to use the sample catalog)'), json);

    const fileRow = document.createElement('div');
    fileRow.className = 'actions';
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'secondary';
    browse.textContent = 'Browse for JSON';
    browse.addEventListener('click', () => {
      void this.bridge.pickProductsFile().then((filePath) => {
        if (filePath) pathField.input.value = filePath;
      });
    });
    const loadFile = document.createElement('button');
    loadFile.type = 'button';
    loadFile.className = 'secondary';
    loadFile.textContent = 'Load file into the box';
    loadFile.addEventListener('click', () => {
      void this.bridge.readProductsFile(pathField.input.value).then((result) => {
        if (!result.ok) {
          message.textContent = result.error;
          message.className = 'warn';
          return;
        }
        json.value = result.json;
        message.textContent = 'File loaded into the editor. Save settings to keep it.';
        message.className = 'catalog-note';
      });
    });
    const useSample = document.createElement('button');
    useSample.type = 'button';
    useSample.className = 'secondary';
    useSample.textContent = 'Insert sample catalog';
    useSample.addEventListener('click', () => {
      json.value = this.bootstrap.sampleProductsJson;
    });
    fileRow.append(browse, loadFile, useSample);

    const message = document.createElement('p');
    message.className = 'hint';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'primary';
    save.textContent = 'Save settings';
    save.addEventListener('click', () => void this.saveSettings({
      clientId: clientField.input.value,
      productsJson: json.value,
      productsPath: pathField.input.value,
      language: language.value,
    }, message));

    const pinInput = labeledInput('New staff PIN', 'password', '');
    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'secondary';
    change.textContent = 'Change PIN';
    change.addEventListener('click', () => void this.changePin(pinInput.input.value, message));

    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'secondary';
    quit.textContent = 'Exit application';
    quit.addEventListener('click', () => void this.quit(message));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'text-button';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeStaff());
    const row = document.createElement('div');
    row.className = 'actions dialog-actions';
    row.append(save, change, quit, close);

    form.append(clientField.label, languageLabel, pathField.label, fileRow, jsonLabel, pinInput.label, message, row);
    this.dialog.append(form);
  }

  private async saveSettings(draft: SettingsDraft, message: HTMLElement): Promise<void> {
    const result = await this.bridge.saveSettings(draft, this.staffPin);
    if (!result.ok) {
      message.className = 'warn';
      message.textContent = result.error;
      return;
    }
    this.bootstrap = result.bootstrap;
    message.className = 'catalog-note';
    message.textContent = 'Saved. Resetting the guest screen so the next visit uses these settings.';
    window.setTimeout(() => void this.resetForNextGuest(), 400);
  }

  private async changePin(nextPin: string, message: HTMLElement): Promise<void> {
    const format = validatePinFormat(nextPin);
    if (format) {
      message.className = 'warn';
      message.textContent = format;
      return;
    }
    const result = await this.bridge.changePin(this.staffPin, nextPin);
    if (!result.ok) {
      message.className = 'warn';
      message.textContent = result.error;
      return;
    }
    this.staffPin = nextPin;
    message.className = 'catalog-note';
    message.textContent = 'PIN updated on this device.';
  }

  private async quit(message: HTMLElement): Promise<void> {
    const result = await this.bridge.quit(this.staffPin);
    if (!result.ok) {
      message.className = 'warn';
      message.textContent = result.error;
    }
  }
}

function labeledInput(label: string, type: 'text' | 'password', value: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'field';
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.autocomplete = 'off';
  input.spellcheck = false;
  field.append(document.createTextNode(label), input);
  return { label: field, input };
}
