using NAudio.Wave;

namespace LastWaveWindows;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--self-test"))
        {
            SelfTest.Run();
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

public sealed record PersonalDjProfile(
    float MinimumDb, float MaximumDb, float PreDropDb, float ImpactDb,
    double LookAheadSeconds, double ImpactHoldSeconds, double CooldownSeconds,
    float StrongSurgeDb, float LoudSurgeDb,
    double PreDuckSeconds, double ImpactAttackSeconds, double ImpactReleaseSeconds)
{
    public static PersonalDjProfile HarshConcert => new(
        GeneratedPersonalDjProfile.MinimumDb,
        GeneratedPersonalDjProfile.MaximumDb,
        GeneratedPersonalDjProfile.PreDropDb,
        GeneratedPersonalDjProfile.ImpactDb,
        GeneratedPersonalDjProfile.LookAheadSeconds,
        GeneratedPersonalDjProfile.ImpactHoldSeconds,
        GeneratedPersonalDjProfile.CooldownSeconds,
        GeneratedPersonalDjProfile.StrongSurgeDb,
        GeneratedPersonalDjProfile.LoudSurgeDb,
        GeneratedPersonalDjProfile.PreDuckSeconds,
        GeneratedPersonalDjProfile.ImpactAttackSeconds,
        GeneratedPersonalDjProfile.ImpactReleaseSeconds);
}

public sealed class DjEnergySampleProvider : ISampleProvider
{
    private readonly ISampleProvider source;
    private readonly PersonalDjProfile profile;
    private readonly int channels;
    private readonly int sampleRate;
    private float bassState, vocalLowState, fullEnergy, vocalEnergy, sideEnergy;
    private float baseGain = 1f, targetBaseGain = 1f, performanceDb;
    private int controlCountdown, impactCountdown = -1, impactHoldFrames, cooldownFrames;
    private readonly float bassAlpha, vocalLowAlpha, envelopeAlpha, baseAttack, baseRelease;
    private readonly float preDuckSmooth, impactAttackSmooth, impactReleaseSmooth;

    public DjEnergySampleProvider(ISampleProvider source, PersonalDjProfile profile)
    {
        this.source = source;
        this.profile = profile;
        WaveFormat = source.WaveFormat;
        channels = WaveFormat.Channels;
        if (channels is < 1 or > 2) throw new NotSupportedException("DJ Energy supports mono or stereo playback.");
        sampleRate = WaveFormat.SampleRate;
        bassAlpha = OnePoleHz(180);
        vocalLowAlpha = OnePoleHz(4000);
        envelopeAlpha = TimeConstant(.020);
        baseAttack = TimeConstant(.080);
        baseRelease = TimeConstant(.350);
        preDuckSmooth = TimeConstant(profile.PreDuckSeconds);
        impactAttackSmooth = TimeConstant(profile.ImpactAttackSeconds);
        impactReleaseSmooth = TimeConstant(profile.ImpactReleaseSeconds);
    }

    public WaveFormat WaveFormat { get; }
    public bool Enabled { get; set; } = true;

    public int Read(float[] buffer, int offset, int count)
    {
        var read = source.Read(buffer, offset, count);
        if (read <= 0 || !Enabled) return read;
        var frames = read / channels;

        for (var frame = 0; frame < frames; frame++)
        {
            var i = offset + frame * channels;
            var left = buffer[i];
            var right = channels == 2 ? buffer[i + 1] : left;
            var mid = channels == 2 ? (left + right) * .5f : left;
            var side = channels == 2 ? (left - right) * .5f : 0f;

            bassState += bassAlpha * (mid - bassState);
            vocalLowState += vocalLowAlpha * (mid - vocalLowState);
            var vocalBand = vocalLowState - bassState;
            var fullPower = channels == 2 ? .5f * (left * left + right * right) : left * left;
            fullEnergy += envelopeAlpha * (fullPower - fullEnergy);
            vocalEnergy += envelopeAlpha * (vocalBand * vocalBand - vocalEnergy);
            sideEnergy += envelopeAlpha * (side * side - sideEnergy);

            if (--controlCountdown <= 0)
            {
                UpdateTarget(buffer, offset, frames, frame);
                controlCountdown = 256;
            }

            var baseSmoothing = targetBaseGain < baseGain ? baseAttack : baseRelease;
            baseGain += (targetBaseGain - baseGain) * baseSmoothing;

            if (cooldownFrames > 0) cooldownFrames--;
            if (impactCountdown >= 0)
            {
                if (impactCountdown == 0)
                {
                    impactCountdown = -1;
                    impactHoldFrames = Math.Max(1, (int)Math.Round(sampleRate * profile.ImpactHoldSeconds));
                    cooldownFrames = Math.Max(1, (int)Math.Round(sampleRate * profile.CooldownSeconds));
                }
                else impactCountdown--;
            }

            var targetDb = GainToDb(baseGain);
            var smooth = impactReleaseSmooth;
            if (impactCountdown >= 0)
            {
                targetDb = profile.PreDropDb;
                smooth = preDuckSmooth;
            }
            else if (impactHoldFrames > 0)
            {
                targetDb = profile.ImpactDb;
                smooth = impactAttackSmooth;
                impactHoldFrames--;
            }
            targetDb = Math.Clamp(targetDb, profile.MinimumDb, profile.MaximumDb);
            performanceDb += (targetDb - performanceDb) * smooth;
            var gain = DbToGain(performanceDb);

            left *= gain;
            right *= gain;
            Protect(ref left, ref right);
            buffer[i] = left;
            if (channels == 2) buffer[i + 1] = right;
        }
        return read;
    }

    private void UpdateTarget(float[] buffer, int offset, int totalFrames, int frame)
    {
        const float eps = 1e-10f;
        var total = Math.Max(fullEnergy, eps);
        var vocalRatio = Math.Clamp(vocalEnergy / total, 0f, 1.5f);
        var centerRatio = vocalEnergy / Math.Max(vocalEnergy + .85f * sideEnergy, eps);
        var bandScore = Math.Clamp((vocalRatio - .08f) / .42f, 0f, 1f);
        var centerScore = Math.Clamp((centerRatio - .52f) / .38f, 0f, 1f);
        var vocalProbability = Math.Clamp(bandScore * (.30f + .70f * centerScore), 0f, 1f);
        var rmsDb = 10f * MathF.Log10(total);
        var energy = Math.Clamp((rmsDb + 42f) / 24f, 0f, 1f);
        var db = (1f - vocalProbability) * (.75f + 4.25f * energy) - vocalProbability * 2f;
        if (rmsDb < -52f) db = 0f;
        targetBaseGain = DbToGain(Math.Clamp(db, profile.MinimumDb, profile.MaximumDb));

        if (cooldownFrames > 0 || impactCountdown >= 0 || impactHoldFrames > 0) return;
        var available = totalFrames - frame - 1;
        var maxLook = Math.Min(available, (int)Math.Round(sampleRate * profile.LookAheadSeconds));
        if (maxLook < 96) return;

        const int step = 32, window = 32;
        var strongest = total;
        var strongestOffset = -1;
        for (var ahead = 64; ahead + window < maxLook; ahead += step)
        {
            float p = 0f;
            for (var w = 0; w < window; w++)
            {
                var j = offset + (frame + ahead + w) * channels;
                var l = buffer[j];
                var r = channels == 2 ? buffer[j + 1] : l;
                p += .5f * (l * l + r * r);
            }
            p /= window;
            if (p > strongest) { strongest = p; strongestOffset = ahead; }
        }
        if (strongestOffset <= 0) return;

        var futureDb = 10f * MathF.Log10(Math.Max(strongest, eps));
        var surgeDb = futureDb - rmsDb;
        if ((surgeDb >= profile.StrongSurgeDb && futureDb > -24f) ||
            (surgeDb >= profile.LoudSurgeDb && futureDb > -10f))
            impactCountdown = strongestOffset;
    }

    private static void Protect(ref float left, ref float right)
    {
        const float ceiling = .944060876f, knee = .841395141f;
        var peak = Math.Max(Math.Abs(left), Math.Abs(right));
        if (peak > 1.25f)
        {
            var g = 1.25f / peak;
            left *= g; right *= g;
        }
        left = SoftSaturate(left, knee, ceiling);
        right = SoftSaturate(right, knee, ceiling);
        left = Math.Clamp(float.IsFinite(left) ? left : 0f, -ceiling, ceiling);
        right = Math.Clamp(float.IsFinite(right) ? right : 0f, -ceiling, ceiling);
    }

    private static float SoftSaturate(float x, float knee, float ceiling)
    {
        var a = Math.Abs(x);
        if (a <= knee) return x;
        var range = ceiling - knee;
        var y = knee + range * MathF.Tanh((a - knee) / range);
        return x >= 0 ? y : -y;
    }

    private float OnePoleHz(double hz) => (float)(1 - Math.Exp(-2 * Math.PI * hz / sampleRate));
    private float TimeConstant(double s) => (float)(1 - Math.Exp(-1 / (sampleRate * s)));
    private static float DbToGain(float db) => MathF.Pow(10f, db / 20f);
    private static float GainToDb(float gain) => 20f * MathF.Log10(Math.Max(gain, 1e-6f));
}

public sealed class MainForm : Form
{
    private readonly Button open = new() { Text = "Open music", AutoSize = true };
    private readonly Button play = new() { Text = "Play", AutoSize = true, Enabled = false };
    private readonly Button stop = new() { Text = "Stop", AutoSize = true, Enabled = false };
    private readonly CheckBox djToggle = new() { Text = "DJ Energy • Personal Concert", Checked = true, AutoSize = true };
    private readonly Label file = new() { Text = "No song loaded", AutoSize = true };
    private readonly TrackBar volume = new() { Minimum = 0, Maximum = 100, Value = 85, TickFrequency = 10, Width = 280 };
    private readonly Label volLabel = new() { Text = "Volume 85%", AutoSize = true };
    private WaveOutEvent? output;
    private AudioFileReader? reader;
    private DjEnergySampleProvider? dj;

    public MainForm()
    {
        Text = "LastWave Windows 4.3.0";
        Width = 650; Height = 330; MinimumSize = new Size(580, 300);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(16, 17, 20); ForeColor = Color.WhiteSmoke;

        var root = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(22), AutoScroll = true };
        root.Controls.Add(new Label { Text = "LastWave • Personal DJ", Font = new Font("Segoe UI", 20, FontStyle.Bold), AutoSize = true });
        root.Controls.Add(new Label { Text = $"Laya preference profile: {GeneratedPersonalDjProfile.Source}", ForeColor = Color.Gainsboro, AutoSize = true });
        root.Controls.Add(new Label { Text = "Predictive pre-drop → impact spike • protected −2 dB to +5 dB window", AutoSize = true });
        root.Controls.Add(file);
        var buttons = new FlowLayoutPanel { AutoSize = true };
        buttons.Controls.Add(open); buttons.Controls.Add(play); buttons.Controls.Add(stop);
        root.Controls.Add(buttons); root.Controls.Add(djToggle); root.Controls.Add(volLabel); root.Controls.Add(volume);
        Controls.Add(root);

        open.Click += (_, _) => OpenMusic();
        play.Click += (_, _) => Toggle();
        stop.Click += (_, _) => Stop(reset: true);
        djToggle.CheckedChanged += (_, _) => { if (dj != null) dj.Enabled = djToggle.Checked; };
        volume.ValueChanged += (_, _) => { volLabel.Text = $"Volume {volume.Value}%"; if (reader != null) reader.Volume = volume.Value / 100f; };
        FormClosed += (_, _) => DisposePlayback();
    }

    private void OpenMusic()
    {
        using var d = new OpenFileDialog { Filter = "Audio files|*.mp3;*.wav;*.aac;*.m4a;*.wma;*.flac|All files|*.*", Title = "Open music" };
        if (d.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            DisposePlayback();
            reader = new AudioFileReader(d.FileName) { Volume = volume.Value / 100f };
            dj = new DjEnergySampleProvider(reader, PersonalDjProfile.HarshConcert) { Enabled = djToggle.Checked };
            output = new WaveOutEvent { DesiredLatency = 100, NumberOfBuffers = 3 };
            output.Init(dj);
            output.PlaybackStopped += (_, _) => BeginInvoke(new Action(() => play.Text = "Play"));
            file.Text = Path.GetFileName(d.FileName);
            play.Enabled = stop.Enabled = true;
        }
        catch (Exception ex)
        {
            DisposePlayback();
            MessageBox.Show(this, ex.Message, "Could not open audio", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void Toggle()
    {
        if (output == null) return;
        if (output.PlaybackState == PlaybackState.Playing) { output.Pause(); play.Text = "Play"; }
        else { output.Play(); play.Text = "Pause"; }
    }
    private void Stop(bool reset) { if (output == null) return; output.Stop(); if (reset && reader != null) reader.Position = 0; play.Text = "Play"; }
    private void DisposePlayback() { output?.Stop(); output?.Dispose(); reader?.Dispose(); output = null; reader = null; dj = null; play.Enabled = stop.Enabled = false; }
}

internal static class SelfTest
{
    public static void Run()
    {
        Ceiling();
        Silence();
        Surge();
        Console.WriteLine("LastWave Windows Personal DJ DSP self-test passed.");
    }

    private static void Ceiling()
    {
        var input = Enumerable.Range(0, 48000).Select(i => i % 20 < 10 ? .98f : -.98f).ToArray();
        var output = Process(input, 48000);
        if (output.Any(x => Math.Abs(x) > .944061f)) throw new InvalidOperationException("DSP ceiling test failed.");
    }
    private static void Silence()
    {
        var output = Process(new float[4096], 44100);
        if (output.Any(x => !float.IsFinite(x))) throw new InvalidOperationException("DSP finite-output test failed.");
    }
    private static void Surge()
    {
        var input = new float[48000 * 2];
        for (var i = 0; i < input.Length; i++) input[i] = i < input.Length / 2 ? .04f : .70f;
        var output = Process(input, 48000);
        if (output.All(x => float.IsFinite(x)) == false) throw new InvalidOperationException("DSP surge test failed.");
    }
    private static float[] Process(float[] input, int rate)
    {
        var src = new ArraySource(input, WaveFormat.CreateIeeeFloatWaveFormat(rate, 2));
        var dsp = new DjEnergySampleProvider(src, PersonalDjProfile.HarshConcert);
        var output = new float[input.Length];
        var read = dsp.Read(output, 0, output.Length);
        if (read != input.Length) throw new InvalidOperationException("DSP read-length test failed.");
        return output;
    }
    private sealed class ArraySource(float[] data, WaveFormat format) : ISampleProvider
    {
        private int position;
        public WaveFormat WaveFormat { get; } = format;
        public int Read(float[] buffer, int offset, int count)
        {
            var take = Math.Min(count, data.Length - position);
            if (take <= 0) return 0;
            Array.Copy(data, position, buffer, offset, take);
            position += take;
            return take;
        }
    }
}
