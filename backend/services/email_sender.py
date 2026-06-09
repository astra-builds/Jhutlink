from abc import ABC, abstractmethod


class EmailSender(ABC):
    """Abstract interface for sending emails."""

    @abstractmethod
    def send(self, to: str, subject: str, body: str) -> bool:
        ...


class ConsoleEmailSender(EmailSender):
    """Prints emails to console — for development/testing."""

    def send(self, to: str, subject: str, body: str) -> bool:
        print(f"\n{'=' * 60}")
        print(f"  EMAIL TO: {to}")
        print(f"  SUBJECT : {subject}")
        print(f"  BODY:")
        for line in body.strip().split("\n"):
            print(f"    {line}")
        print(f"{'=' * 60}\n")
        return True


class SmtpEmailSender(EmailSender):
    """
    Sends emails via SMTP. Works with Gmail (free with app password),
    SendGrid, or any SMTP provider.

    Usage with Gmail (requires an App Password):
        sender = SmtpEmailSender(
            host="smtp.gmail.com",
            port=587,
            username="your@gmail.com",
            password="your-app-password",
        )
    """

    def __init__(
        self,
        host: str = "smtp.gmail.com",
        port: int = 587,
        username: str = "",
        password: str = "",
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def send(self, to: str, subject: str, body: str) -> bool:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.username
        msg["To"] = to
        msg.set_content(body)

        try:
            with smtplib.SMTP(self.host, self.port) as server:
                server.starttls()
                server.login(self.username, self.password)
                server.send_message(msg)
            return True
        except Exception as e:
            print(f"Failed to send email to {to}: {e}")
            return False
