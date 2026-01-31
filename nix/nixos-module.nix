{
  self,
  inputs,
  ...
}:
{
  flake.nixosModules.default =
    {
      config,
      lib,
      pkgs,
      ...
    }:

    with lib;

    let
      cfg = config.services.cinephage;
    in
    {
      options.services.cinephage = {
        enable = mkEnableOption "Cinephage media management service";

        package = mkOption {
          type = types.package;
          default = inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.default;
          defaultText = lib.literalExpression "inputs.self.packages.\${pkgs.stdenv.hostPlatform.system}.default";
          description = "The Cinephage package to use.";
        };

        ffmpeg = {
          enable = mkOption {
            type = types.bool;
            default = true;
            description = "Whether to enable FFmpeg for Cinephage.";
          };

          package = mkOption {
            type = types.package;
            default = pkgs.ffmpeg;
            defaultText = literalExpression "pkgs.ffmpeg";
            description = "The FFmpeg package to use.";
          };
        };

        user = mkOption {
          type = types.str;
          default = "cinephage";
          description = "User account under which Cinephage runs.";
        };

        group = mkOption {
          type = types.str;
          default = "cinephage";
          description = "Group account under which Cinephage runs.";
        };

        environment = mkOption {
          type = types.attrsOf types.str;
          default = { };
          description = "Additional environment variables for the Cinephage service.";
          example = {
            NODE_ENV = "production";
            PORT = "3000";
          };
        };

        media = mkOption {
          type = types.listOf types.str;
          default = [ ];
          description = "List of media directories that Cinephage needs to access. These will be added to the service's ReadWritePaths.";
          example = [
            "/media/movies"
            "/media/tv"
            "/media/downloads"
          ];
        };
      };

      config = mkIf cfg.enable {
        # Create user and group
        users.users."${cfg.user}" = {
          group = cfg.group;
          isSystemUser = true;
          description = "Cinephage service user";
        };

        users.groups."${cfg.group}" = {
          name = cfg.group;
        };

        # Systemd service
        systemd.services.cinephage = {
          description = "Cinephage media management service";
          wantedBy = [ "multi-user.target" ];
          after = [ "network.target" ];

          # Copy bundled indexers if definitions directory is empty or missing
          preStart = ''
            # Create parent directories
            mkdir -p /var/lib/cinephage/{data,data/indexers,logs}

            # Copy bundled indexers from package if definitions directory is empty or missing
            DEFINITIONS_DIR="/var/lib/cinephage/data/indexers/definitions"
            BUNDLED_DIR="${cfg.package}/lib/data/indexers"

            # Check if definitions directory is missing or empty
            if [ ! -d "$DEFINITIONS_DIR" ] || [ -z "$(ls -A "$DEFINITIONS_DIR" 2>/dev/null)" ]; then
              echo "Initializing indexer definitions from bundled files..."
              # Copy contents of bundled-indexers to data/indexers
              cp -r "$BUNDLED_DIR"/* "$DEFINITIONS_DIR/"
              echo "Copied indexer definitions from package"
            fi

            # Set correct ownership
            chown -R ${cfg.user}:${cfg.group} /var/lib/cinephage
          '';

          serviceConfig = {
            Type = "simple";
            User = cfg.user;
            Group = cfg.group;
            StateDirectory = "cinephage";
            StateDirectoryMode = "0750";
            WorkingDirectory = "/var/lib/cinephage";
            Restart = "on-failure";
            RestartSec = 5;

            # Set up environment variables
            Environment = [
              "NODE_ENV=production"
              "DATA_DIR=/var/lib/cinephage/data"
              "INDEXER_DEFINITIONS_PATH=/var/lib/cinephage/data/indexers/definitions"
              "LOG_DIR=/var/lib/cinephage/logs"
            ]
            ++ optionals cfg.ffmpeg.enable [
              "FFPROBE_PATH=${cfg.ffmpeg.package}/bin/ffprobe"
            ]
            ++ mapAttrsToList (name: value: "${name}=${value}") cfg.environment;

            # Run the cinephage command
            ExecStart = "${cfg.package}/bin/cinephage";

            # Security settings
            PrivateTmp = true;
            ProtectSystem = "strict";
            ReadWritePaths = [ "/var/lib/cinephage" ] ++ cfg.media;
            NoNewPrivileges = true;
          };
        };

        # Ensure the package is available
        environment.systemPackages = [ cfg.package ] ++ optionals cfg.ffmpeg.enable [ cfg.ffmpeg.package ];
      };
    };
}
