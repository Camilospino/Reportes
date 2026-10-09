FROM postgres:16-alpine
RUN apk add --no-cache aws-cli tzdata
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
  && echo "0 3 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
# crond en primer plano; respaldo diario a las 3:00 a. m. (hora de Colombia)
CMD ["crond", "-f", "-l", "8"]
